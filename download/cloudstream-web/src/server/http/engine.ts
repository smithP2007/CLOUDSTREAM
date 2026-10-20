/**
 * The HTTP engine — roadmap Phase 2 task 1 (`src/server/http/`), the web
 * equivalent of upstream nicehttp (OkHttp wrapper) minus the Android parts.
 * Built on `undici` with an `Agent` whose connector `lookup` is the guarded
 * DNS resolver, so every TCP connection uses ONLY addresses that passed the
 * SSRF guard (DNS validation and connection cannot disagree — D18).
 *
 * Per-request pipeline (each hop of a redirect chain repeats 1–5):
 *  1. URL parse + destination guard (scheme/credentials/hostname/IP rules;
 *     explicit `approvedDestinations` are the only private-host exception).
 *  2. robots.txt gate for GET/HEAD (opt-out per request; RFC 9309-ish).
 *  3. DNS: resolve all records, validate every one (fail closed on ANY
 *     non-public record), cache the validated set; the connector lookup
 *     serves only that set.
 *  4. Dispatch with a total-deadline `AbortController` (timeout + caller
 *     signal + size cap all funnel into one cancellation path).
 *  5. Read the response under a hard byte cap.
 *
 * Redirects are followed MANUALLY: every `Location` is re-validated through
 * the same pipeline (a redirect can never reach a prohibited destination),
 * redirect limits are enforced, and cross-origin hops drop credential-bearing
 * headers (authorization) and jar cookies. 301/302/303 switch to GET;
 * 307/308 preserve method and body.
 *
 * Typed results only: `fetch` NEVER throws for expected failures (invalid
 * URLs, blocked destinations, DNS failures, timeouts, aborts, size caps,
 * redirect loops, robots denials, network errors). Cookies/credentials are
 * never placed in events (origin+path only) or error messages.
 *
 * Security limitations are recorded in `docs/decisions.md` D18 — notably:
 * this is a LIBRARY for first-party provider code, not a proxy route; no HTTP
 * surface accepts client-supplied URLs in this phase.
 */

import { Agent, request as undiciRequest } from 'undici';
import type { Dispatcher } from 'undici';
import type { LookupFunction } from 'node:net';

import type { CookieJar } from './cookies';
import { GuardedDnsResolver, DnsValidationError, type ValidatedAddress } from './dns';
import { validateDestinationUrl, type ApprovedDestination } from './guard';
import { normalizeRequestHeaders } from './headers';
import { RobotsGate } from './robots';
import { TtlCache } from './cache';

/** Abort reason when the engine's total deadline elapses. */
export class HttpTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`HTTP request exceeded its ${timeoutMs}ms deadline`);
    this.name = 'HttpTimeoutError';
  }
}

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export type HttpFailureKind =
  | 'invalidUrl'
  | 'blockedDestination'
  | 'dnsFailure'
  | 'timeout'
  | 'aborted'
  | 'tooManyRedirects'
  | 'invalidRedirect'
  | 'responseTooLarge'
  | 'robotsDisallowed'
  | 'networkError'
  | 'unsupportedMethod'
  | 'internalError';

export interface HttpFailure {
  kind: HttpFailureKind;
  message: string;
  /** The URL the failure is attributed to (final hop when redirected). */
  url?: string;
  cause?: unknown;
}

export interface HttpResponse {
  status: number;
  /** Lowercased header names; duplicate values joined with ', '. */
  headers: Record<string, string>;
  body: Uint8Array;
  /** Final URL after redirects. */
  url: string;
  redirected: boolean;
  fromCache: boolean;
  /** Hops taken (request URLs), excluding the initial URL. */
  redirectChain: string[];
  text(): string;
  json(): unknown;
}

export type HttpResult =
  | { ok: true; response: HttpResponse }
  | { ok: false; failure: HttpFailure };

export interface HttpEngineConfig {
  /** Audit label for events (e.g. the provider name). Never a secret. */
  providerName?: string;
  userAgent?: string;
  /** Per-provider profile headers (first-party configuration, e.g. UA/referer). */
  defaultHeaders?: Record<string, string>;
  /** Opt-in cookie jar. Absent = the engine stores and sends NO cookies. */
  cookieJar?: CookieJar;
  /** Total deadline per fetch INCLUDING redirects (default 30 s). */
  timeoutMs?: number;
  /** Connector connect timeout (default 10 s). */
  connectTimeoutMs?: number;
  maxRedirects?: number;
  /** Response body cap (default 10 MiB). */
  maxBytes?: number;
  /** Response cache TTL for GET/HEAD 2xx (default 30 s; 0 disables caching). */
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  cacheMaxBytes?: number;
  /** Validated-DNS cache TTL (default 60 s). */
  dnsTtlMs?: number;
  /** robots.txt gating for GET/HEAD (default true). */
  respectRobots?: boolean;
  /** Explicitly approved destinations (the only private-host exception). */
  approvedDestinations?: readonly ApprovedDestination[];
  /** Injectable guarded DNS resolver (tests / shared composition). */
  dns?: GuardedDnsResolver;
  /** Optional event sink. Events contain origin+path only — never queries. */
  onRequestEvent?: (event: HttpEngineEvent) => void;
}

export type HttpEngineEvent =
  | { kind: 'request'; provider?: string; origin: string; path: string }
  | { kind: 'redirect'; provider?: string; origin: string; path: string; status: number }
  | { kind: 'cacheHit'; provider?: string; origin: string; path: string }
  | { kind: 'dnsValidated'; provider?: string; host: string; addresses: number }
  | { kind: 'blocked'; provider?: string; reason: string; detail: string };

export interface HttpRequestOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
  /** Overrides the engine default for THIS request. */
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** 'default' caches eligible responses; 'no-store' bypasses (default 'default'). */
  cache?: 'default' | 'no-store';
  /** Per-request robots override (default: engine config). */
  respectRobots?: boolean;
}

const DEFAULTS: Required<
  Pick<
    HttpEngineConfig,
    'timeoutMs' | 'connectTimeoutMs' | 'maxRedirects' | 'maxBytes' | 'cacheTtlMs' | 'cacheMaxEntries' | 'cacheMaxBytes' | 'dnsTtlMs' | 'respectRobots' | 'userAgent'
  >
> = {
  timeoutMs: 30_000,
  connectTimeoutMs: 10_000,
  maxRedirects: 5,
  maxBytes: 10 * 1024 * 1024,
  cacheTtlMs: 30_000,
  cacheMaxEntries: 100,
  cacheMaxBytes: 32 * 1024 * 1024,
  dnsTtlMs: 60_000,
  respectRobots: true,
  userAgent: 'cloudstream-web-engine/0.1',
};

const SUPPORTED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE']);
const SENSITIVE_REQUEST_HEADERS = new Set(['authorization', 'proxy-authorization', 'referer']);

/* -------------------------------------------------------------------------- */
/* The engine                                                                  */
/* -------------------------------------------------------------------------- */

export class HttpEngine {
  readonly #config: HttpEngineConfig;
  readonly #dns: GuardedDnsResolver;
  readonly #responseCache: TtlCache<CachedResponse>;
  readonly #agent: Agent;
  readonly #robots: RobotsGate | null;

  constructor(config: HttpEngineConfig = {}) {
    this.#config = config;
    this.#dns =
      config.dns ??
      new GuardedDnsResolver({
        ttlMs: this.#num('dnsTtlMs'),
        approvedDestinations: config.approvedDestinations,
      });
    this.#responseCache = new TtlCache<CachedResponse>({
      maxEntries: this.#num('cacheMaxEntries'),
      maxBytes: this.#num('cacheMaxBytes'),
      sizeOf: (entry) => entry.body.byteLength + 512,
    });
    const lookup = this.#dns.lookupForAgent();
    this.#agent = new Agent({
      connect: {
        // The guarded lookup (empirically verified): the connector connects to
        // addresses served by this function ONLY — see dns.ts. Cast through
        // unknown: our callback uses Node's array form, which net.connect accepts.
        lookup: lookup as unknown as LookupFunction,
        timeout: this.#num('connectTimeoutMs'),
      },
      // Per-operation ceilings; the total deadline aborts sooner when needed.
      headersTimeout: this.#num('timeoutMs'),
      bodyTimeout: this.#num('timeoutMs'),
    });
    this.#robots = new RobotsGate({
      fetchText: async (url) => {
        const result = await this.fetch(url, {
          method: 'GET',
          respectRobots: false, // robots.txt itself is never gated
          cache: 'no-store',
          maxBytes: 512 * 1024,
        });
        if (!result.ok) throw new Error(`robots fetch failed: ${result.failure.kind}`);
        return { status: result.response.status, text: result.response.text() };
      },
      userAgent: this.#str('userAgent'),
    });
  }

  #num<K extends 'timeoutMs' | 'connectTimeoutMs' | 'maxRedirects' | 'maxBytes' | 'cacheTtlMs' | 'cacheMaxEntries' | 'cacheMaxBytes' | 'dnsTtlMs'>(key: K): number {
    return (this.#config[key] ?? DEFAULTS[key]) as number;
  }

  #str(key: 'userAgent'): string {
    return (this.#config[key] ?? DEFAULTS[key]) as string;
  }

  #bool(key: 'respectRobots'): boolean {
    return (this.#config[key] ?? DEFAULTS[key]) as boolean;
  }

  /** Closes pooled connections (used by tests/shutdown). */
  async close(): Promise<void> {
    await this.#agent.close();
  }

  /**
   * Performs a guarded, size-capped, timeout-bounded, redirect-validating
   * request. Never throws for expected failures — see {@link HttpResult}.
   */
  async fetch(rawUrl: string | URL, options: HttpRequestOptions = {}): Promise<HttpResult> {
    try {
      return await this.#run(rawUrl, options);
    } catch (error: unknown) {
      // Anything that escapes the pipeline is an engine bug — type it as
      // 'internalError' rather than leaking a raw exception to callers.
      return {
        ok: false,
        failure: {
          kind: 'internalError',
          message: error instanceof Error ? error.message : 'unknown engine error',
          cause: error,
        },
      };
    }
  }

  async #run(rawUrl: string | URL, options: HttpRequestOptions): Promise<HttpResult> {
    const method = (options.method ?? 'GET').toUpperCase();
    if (!SUPPORTED_METHODS.has(method)) {
      return failure('unsupportedMethod', `method '${method}' is not supported`);
    }

    // 1. Validate the INITIAL destination.
    const firstVerdict = validateDestinationUrl(rawUrl, {
      approvedDestinations: this.#config.approvedDestinations,
    });
    if (!firstVerdict.allowed) {
      this.#emit({ kind: 'blocked', reason: firstVerdict.reason, detail: firstVerdict.detail });
      return failure('blockedDestination', firstVerdict.detail);
    }

    const timeoutMs = options.timeoutMs ?? this.#num('timeoutMs');
    const maxBytes = options.maxBytes ?? this.#num('maxBytes');
    const maxRedirects = options.maxRedirects ?? this.#num('maxRedirects');
    const respectRobots = options.respectRobots ?? this.#bool('respectRobots');
    const cacheMode = options.cache ?? 'default';

    // Total deadline across ALL hops.
    const deadline = Date.now() + timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new HttpTimeoutError(timeoutMs)),
      Math.min(timeoutMs, 2_147_000_000),
    );
    const callerSignal = options.signal;
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) {
      clearTimeout(timer);
      return failure('aborted', 'request aborted before it started', firstVerdict.url.toString());
    }
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      // 2. Cache lookup (GET/HEAD only).
      const cacheKey = `${method} ${firstVerdict.url.toString()}`;
      if (method === 'GET' || method === 'HEAD') {
        const cached = this.#responseCache.get(cacheKey);
        if (cached !== undefined && cacheMode === 'default') {
          this.#emit(cacheEvent(firstVerdict.url));
          return { ok: true, response: cachedResponse(cached, firstVerdict.url.toString()) };
        }
      }

      // 3. Hop loop.
      let currentUrl = firstVerdict.url;
      let currentMethod = method;
      let currentBody = options.body;
      const initial = normalizeRequestHeaders(options.headers, {
        'user-agent': this.#str('userAgent'),
        ...this.#config.defaultHeaders,
      });
      let hopHeaders: Record<string, string> = initial.headers;
      const redirectChain: string[] = [];
      let redirects = 0;

      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          return failure('timeout', `request exceeded ${timeoutMs}ms deadline`, currentUrl.toString());
        }

        // Per-hop destination validation (redirect targets included).
        const verdict = validateDestinationUrl(currentUrl, {
          approvedDestinations: this.#config.approvedDestinations,
        });
        if (!verdict.allowed) {
          this.#emit({ kind: 'blocked', reason: verdict.reason, detail: verdict.detail });
          return failure('blockedDestination', verdict.detail, currentUrl.toString());
        }

        // DNS: validate BEFORE the robots gate so destination problems surface
        // as destination errors (the robots inner fetch would otherwise turn
        // them into fail-closed robots denials). The connector lookup
        // enforces the same validated set at connect time.
        if (verdict.kind === 'hostname') {
          try {
            const addresses = await this.#dns.validateAndCache(verdict.url.hostname);
            this.#emit({
              kind: 'dnsValidated',
              host: verdict.url.hostname,
              addresses: addresses.length,
            });
          } catch (error) {
            if (error instanceof DnsValidationError) {
              return failure(
                error.kind === 'blocked' ? 'blockedDestination' : 'dnsFailure',
                error.message,
                currentUrl.toString(),
              );
            }
            return failure('dnsFailure', 'DNS validation failed', currentUrl.toString());
          }
        } else if (verdict.literal !== undefined) {
          this.#dns.pinLiteral(verdict.url.hostname, verdict.literal);
        }

        // robots gate (GET/HEAD only, after destination + DNS validation).
        if (respectRobots && (currentMethod === 'GET' || currentMethod === 'HEAD')) {
          const allowed = await this.#robots?.isAllowed(currentUrl);
          if (allowed === false) {
            return failure('robotsDisallowed', 'disallowed by robots.txt', currentUrl.toString());
          }
        }

        // Cookies for THIS hop's origin only (jar is per-provider by construction).
        const headers: Record<string, string> = { ...hopHeaders };
        if (this.#config.cookieJar !== undefined) {
          const cookieHeader = this.#config.cookieJar.headerFor(verdict.url);
          if (cookieHeader !== null) headers['cookie'] = cookieHeader;
        }

        this.#emit({ kind: 'request', origin: verdict.url.origin, path: verdict.url.pathname });

        // Dispatch + read with size cap. headersTimeout/bodyTimeout come from
        // the agent config; the total deadline aborts via the signal. undici
        // request() does NOT follow redirects on its own — handled below.
        let response: Dispatcher.ResponseData;
        try {
          response = await undiciRequest(verdict.url, {
            method: currentMethod,
            headers,
            body:
              currentMethod === 'GET' || currentMethod === 'HEAD' ? undefined : currentBody,
            dispatcher: this.#agent,
            signal: controller.signal,
          });
        } catch (error: unknown) {
          return classifyDispatchError(error, controller, currentUrl, callerSignal);
        }

        const setCookies = collectSetCookies(response.headers);
        const chunks: Buffer[] = [];
        let total = 0;
        try {
          for await (const chunk of response.body) {
            const buf = chunk as Buffer;
            total += buf.byteLength;
            if (total > maxBytes) {
              controller.abort();
              return failure(
                'responseTooLarge',
                `response body exceeded ${maxBytes} bytes`,
                currentUrl.toString(),
              );
            }
            chunks.push(buf);
          }
        } catch (error: unknown) {
          return classifyDispatchError(error, controller, currentUrl, callerSignal);
        }
        const body = concatChunks(chunks, total);

        const responseHeaders = normalizeResponseHeaders(response.headers);

        // Cookie storage (per-provider jar; cross-host planting rejected by jar).
        if (this.#config.cookieJar !== undefined && setCookies.length > 0) {
          this.#config.cookieJar.storeFromResponse(setCookies, verdict.url);
        }

        // Redirect handling (manual, validated).
        const location = responseHeaders['location'];
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          typeof location === 'string' &&
          location !== ''
        ) {
          redirects += 1;
          if (redirects > maxRedirects) {
            return failure(
              'tooManyRedirects',
              `more than ${maxRedirects} redirects`,
              currentUrl.toString(),
            );
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, verdict.url);
          } catch {
            return failure('invalidRedirect', `unparseable redirect target '${location}'`, currentUrl.toString());
          }
          if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
            return failure(
              'invalidRedirect',
              `redirect to non-http(s) scheme '${nextUrl.protocol}'`,
              currentUrl.toString(),
            );
          }

          const crossOrigin = verdict.url.origin !== nextUrl.origin;
          const nextHeaders: Record<string, string> = { ...hopHeaders };
          if (crossOrigin) {
            // Credentials must not follow a cross-origin redirect.
            for (const name of SENSITIVE_REQUEST_HEADERS) delete nextHeaders[name];
          }
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
            currentMethod = 'GET';
            currentBody = undefined;
            delete nextHeaders['content-type'];
          }
          hopHeaders = nextHeaders;
          redirectChain.push(nextUrl.toString());
          this.#emit({
            kind: 'redirect',
            origin: nextUrl.origin,
            path: nextUrl.pathname,
            status: response.statusCode,
          });
          currentUrl = nextUrl;
          continue;
        }

        // Final response — cache eligible GET/HEAD 2xx without set-cookie.
        const httpResponse: HttpResponse = {
          status: response.statusCode,
          headers: responseHeaders,
          body,
          url: currentUrl.toString(),
          redirected: redirects > 0,
          fromCache: false,
          redirectChain,
          text: () => new TextDecoder('utf-8', { fatal: false }).decode(body),
          json: () => JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(body)) as unknown,
        };
        if (
          (method === 'GET' || method === 'HEAD') && // original method, not redirect-switched
          cacheMode === 'default' &&
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          setCookies.length === 0
        ) {
          const ttl = cacheTtlFor(responseHeaders['cache-control'], this.#num('cacheTtlMs'));
          if (ttl > 0) {
            this.#responseCache.set(cacheKey, { ...httpResponse, fromCache: false }, ttl);
          }
        }
        return { ok: true, response: httpResponse };
      }
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  #emit(event: HttpEngineEvent): void {
    try {
      this.#config.onRequestEvent?.(event);
    } catch {
      // Event sinks must never break requests.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type CachedResponse = HttpResponse;

function failure(kind: HttpFailureKind, message: string, url?: string): HttpResult {
  return { ok: false, failure: { kind, message, ...(url !== undefined ? { url } : {}) } };
}

function cacheEvent(url: URL): HttpEngineEvent {
  return { kind: 'cacheHit', origin: url.origin, path: url.pathname };
}

function classifyDispatchError(
  error: unknown,
  controller: AbortController,
  url: URL,
  callerSignal?: AbortSignal,
): HttpResult {
  const reason = controller.signal.reason;
  if (reason instanceof HttpTimeoutError) {
    return failure('timeout', reason.message, url.toString());
  }
  if (callerSignal?.aborted || (reason instanceof Error && reason.name === 'AbortError')) {
    return failure('aborted', 'request aborted', url.toString());
  }
  const message = error instanceof Error ? error.message : 'network error';
  return {
    ok: false,
    failure: { kind: 'networkError', message, url: url.toString(), cause: error },
  };
}

/**
 * Normalizes undici's response headers (flat string-array or record) into a
 * lowercase record, joining duplicates with ', '. `set-cookie` is handled
 * separately by {@link collectSetCookies} (it must not be joined).
 */
function normalizeResponseHeaders(raw: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  const add = (name: string, value: string): void => {
    const key = name.toLowerCase();
    if (key === 'set-cookie') return;
    headers[key] = key in headers ? `${headers[key]}, ${value}` : value;
  };
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      add(String(raw[i] ?? ''), String(raw[i + 1] ?? ''));
    }
  } else if (typeof raw === 'object' && raw !== null) {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) value.forEach((v) => add(name, String(v)));
      else if (value !== undefined) add(name, String(value));
    }
  }
  return headers;
}

function collectSetCookies(raw: unknown): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value === 'string' && value !== '') out.push(value);
  };
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      if (String(raw[i] ?? '').toLowerCase() === 'set-cookie') push(raw[i + 1]);
    }
  } else if (typeof raw === 'object' && raw !== null) {
    const value = (raw as Record<string, unknown>)['set-cookie'];
    if (Array.isArray(value)) value.forEach(push);
    else push(value);
  }
  return out;
}

function cacheTtlFor(cacheControl: string | undefined, configuredTtl: number): number {
  if (cacheControl === undefined) return configuredTtl;
  const directives = cacheControl.toLowerCase().split(',').map((d) => d.trim());
  if (directives.includes('no-store') || directives.includes('no-cache') || directives.includes('private')) {
    return 0;
  }
  for (const directive of directives) {
    const match = /^max-age=(\d+)$/.exec(directive);
    if (match !== null) return Math.min(Number(match[1] ?? 0) * 1000, configuredTtl);
  }
  return configuredTtl;
}

function concatChunks(chunks: Buffer[], total: number): Uint8Array {
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function cachedResponse(cached: CachedResponse, url: string): HttpResponse {
  return { ...cached, url, fromCache: true };
}

export type { ValidatedAddress };
