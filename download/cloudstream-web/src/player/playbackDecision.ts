/**
 * The playback decision flow (owner instruction §7) — pure and testable,
 * independent of React and of any engine implementation.
 *
 * Order of preference for every source:
 *   1. validate the source;
 *   2. classify special requirements (relay-required for header/referer links);
 *   3. attempt native playback when the browser says it can;
 *   4. select the HLS/DASH engine when the source requires one;
 *   5. for unsupported LOCAL files, offer client-side conversion (never automatic);
 *   6. for unsupported REMOTE streams, report the exact limitation;
 *   7. never route anything through a server-side converter (none exists);
 *   8. report a typed, human-readable error when no permitted path exists.
 */

import type { MediaCapabilities, PlaybackLink } from './types';
import type { PlaybackError } from './errors';
import {
  containerFromFilename,
  detectDashSupport,
  detectHlsSupport,
  probeNativeContainer,
  type Container,
} from './formatSupport';
import {
  DEFAULT_MAX_CONVERT_INPUT_BYTES,
  pickConversionProfile,
  type ConversionProfile,
} from './conversion/profiles';

/** Whether client-side conversion may be offered in this environment. */
export interface ConversionAvailability {
  readonly available: boolean;
  /** Present when `available === false` — shown to the user verbatim. */
  readonly unavailableReason?: string;
  readonly maxInputBytes: number;
}

export function conversionAvailability(
  available: boolean,
  maxInputBytes: number = DEFAULT_MAX_CONVERT_INPUT_BYTES,
  unavailableReason?: string,
): ConversionAvailability {
  return available ? { available, maxInputBytes } : { available, maxInputBytes, unavailableReason };
}

export type DecisionAction =
  | { readonly action: 'native'; readonly reason: string }
  | { readonly action: 'engine'; readonly engine: 'hls' | 'dash'; readonly reason: string }
  | {
      readonly action: 'offer-conversion';
      readonly reason: string;
      readonly profile: ConversionProfile;
      readonly maxInputBytes: number;
    }
  | {
      readonly action: 'relay-required';
      readonly reason: string;
    }
  | { readonly action: 'unplayable'; readonly reason: string; readonly code: PlaybackError['code'] };

export interface DecisionContext {
  readonly caps: MediaCapabilities;
  readonly conversion: ConversionAvailability;
}

const REMOTE_ONLY_CONTAINERS: ReadonlySet<Container> = new Set(['avi', 'flv', 'mpegts']);

/**
 * Playable URL policy: absolute http(s), or an EXPLICIT same-origin relative
 * path (/, ./, ../ — the browser resolves it against the page origin; nothing
 * is proxied). Any other scheme or garbage (ftp:, javascript:, data:, 'not a
 * url') is rejected up front.
 */
function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    // Not an absolute URL: allow explicit same-origin relative paths only.
    return raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../');
  }
}

function requiresRelay(headers: Record<string, string> | null | undefined, referer: string | null | undefined): boolean {
  const headerNames = headers ? Object.keys(headers) : [];
  return headerNames.length > 0 || (referer != null && referer.trim() !== '');
}

/** Extension hint for a remote URL path (HINT ONLY — probes stay authoritative). */
function containerFromUrlPath(url: string): Container {
  try {
    return containerFromFilename(new URL(url).pathname);
  } catch {
    return 'unknown';
  }
}

/** Decision for a provider `PlaybackLink`-shaped source. */
export function decideLinkPlayback(
  link: Pick<PlaybackLink, 'type' | 'url' | 'headers' | 'referer'>,
  ctx: DecisionContext,
): DecisionAction {
  if (!isValidHttpUrl(link.url)) {
    return {
      action: 'unplayable',
      code: 'invalid-source',
      reason: 'The link URL is missing, malformed, or not http(s).',
    };
  }

  // Never hand header/referer sources to any proxy or pseudo-proxy: browsers
  // cannot attach custom headers to <video>/MSE fetches anyway, and building a
  // relay is a separate gated decision (D8). Report and move on.
  if (requiresRelay(link.headers, link.referer)) {
    return {
      action: 'relay-required',
      reason:
        'This source requires custom request headers/referer. Direct browser playback cannot send them, and no media relay is built in this milestone (decision D8 scope).',
    };
  }

  if (link.type === 'hls') {
    const support = detectHlsSupport(ctx.caps);
    if (support === 'mse') return { action: 'engine', engine: 'hls', reason: 'HLS via hls.js (MediaSource Extensions detected).' };
    if (support === 'native') return { action: 'native', reason: 'HLS via native browser HLS support.' };
    return {
      action: 'unplayable',
      code: 'unsupported-format',
      reason: 'This browser has neither MediaSource Extensions nor native HLS support.',
    };
  }

  if (link.type === 'dash') {
    if (detectDashSupport(ctx.caps) === 'mse') {
      return { action: 'engine', engine: 'dash', reason: 'DASH via dash.js (MediaSource Extensions detected).' };
    }
    return {
      action: 'unplayable',
      code: 'unsupported-format',
      reason: 'DASH playback requires MediaSource Extensions, which this browser does not provide.',
    };
  }

  // Progressive video: probe the hinted container family first so obviously
  // incompatible remote files fail EARLY with a clear reason (no client-side
  // conversion exists for remote sources — they are not downloaded wholesale).
  const hinted = containerFromUrlPath(link.url);
  if (hinted !== 'unknown') {
    const probe = probeNativeContainer(hinted, ctx.caps);
    if (probe === '') {
      const extra = REMOTE_ONLY_CONTAINERS.has(hinted)
        ? `${hinted.toUpperCase()} is never natively supported by browsers.`
        : `${hinted.toUpperCase()} support is browser-dependent.`;
      return {
        action: 'unplayable',
        code: 'unsupported-format',
        reason: `The browser reports no native support for this ${hinted.toUpperCase()} progressive stream. ${extra} Converting remote files in the browser is not supported.`,
      };
    }
    return { action: 'native', reason: `Native progressive playback (${probe} support reported for ${hinted.toUpperCase()}).` };
  }

  return {
    action: 'native',
    reason: 'Native progressive playback attempt (container unknown from the URL; the browser validates on decode).',
  };
}

/** Decision for a local file the user picked (container from head-sniffing). */
export function decideLocalPlayback(
  file: { container: Container; sizeBytes: number; fileName: string },
  ctx: DecisionContext,
): DecisionAction {
  // Unknown signature: missing/invalid metadata — handle gracefully by letting
  // the browser try (it validates on decode) instead of demanding conversion.
  if (file.container === 'unknown') {
    return { action: 'native', reason: 'Container unrecognized from the file header; attempting native playback (the browser validates on decode).' };
  }

  const probe = probeNativeContainer(file.container, ctx.caps);
  if (probe !== '') {
    return {
      action: 'native',
      reason: `Native playback (${probe} support reported for ${file.container.toUpperCase()}).`,
    };
  }

  if (!ctx.conversion.available) {
    return {
      action: 'unplayable',
      code: 'unsupported-format',
      reason: ctx.conversion.unavailableReason
        ? `The browser reports no native support for ${file.container.toUpperCase()}. Conversion is unavailable: ${ctx.conversion.unavailableReason}`
        : `The browser reports no native support for ${file.container.toUpperCase()} and conversion is unavailable.`,
    };
  }

  if (file.sizeBytes > ctx.conversion.maxInputBytes) {
    return {
      action: 'unplayable',
      code: 'unsupported-format',
      reason: `No native support for ${file.container.toUpperCase()}, and the file (${file.sizeBytes} bytes) exceeds the conversion input limit (${ctx.conversion.maxInputBytes} bytes).`,
    };
  }

  const profile = pickConversionProfile(ctx.caps);
  if (!profile) {
    return {
      action: 'unplayable',
      code: 'unsupported-format',
      reason: `No native support for ${file.container.toUpperCase()}, and no browser-compatible conversion output (MP4/WebM) is available.`,
    };
  }

  return {
    action: 'offer-conversion',
    reason: `The browser reports no native support for ${file.container.toUpperCase()} (${file.fileName}).`,
    profile,
    maxInputBytes: ctx.conversion.maxInputBytes,
  };
}

/* -------------------------------------------------------------------------- */
/* Bounded source fallback                                                     */
/* -------------------------------------------------------------------------- */

/** True when a decision is worth an automatic playback attempt. */
export function isAttemptable(action: DecisionAction): boolean {
  return action.action === 'native' || action.action === 'engine';
}

/**
 * Orders candidate indices for bounded fallback: the preferred index first,
 * then every attemptable candidate in list order. The caller enforces the
 * attempt cap — this helper never loops.
 */
export function fallbackOrder(
  decisions: ReadonlyArray<DecisionAction>,
  preferredIndex: number,
): number[] {
  const order: number[] = [];
  if (preferredIndex >= 0 && preferredIndex < decisions.length) order.push(preferredIndex);
  for (let i = 0; i < decisions.length; i++) {
    if (i !== preferredIndex && isAttemptable(decisions[i] as DecisionAction)) order.push(i);
  }
  return order;
}
