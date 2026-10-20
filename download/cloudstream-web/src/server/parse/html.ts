/**
 * Server-only HTML toolkit (roadmap Phase 2 step 3, revised by the owner
 * instruction of 2026-10-20 — see docs/decisions.md D19).
 *
 * Cheerio-based parsing of *static* HTML with:
 *  - input size caps (default 2 MiB) — a page is parsed at most once;
 *  - never-throwing entry points: every function returns a typed result or a
 *    plain value, so a malformed page degrades to "empty" instead of crashing
 *    a provider call;
 *  - safe extraction of text, attributes, hyperlinks (absolutized against a
 *    base URL) and structured metadata (title / description / canonical /
 *    OpenGraph).
 *
 * This module is intentionally dumb: it has no provider logic, no network
 * access and no code execution. It only walks the DOM that cheerio built.
 *
 * SECURITY NOTE: HTML is untrusted input. Values extracted here (text,
 * attributes, hrefs) MUST NOT be inserted into other HTML contexts without
 * escaping, and MUST NOT be handed to any evaluator. Nothing in this project
 * evaluates extracted content (D19).
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

/** Default input cap: 2 MiB of HTML is far above typical provider pages. */
export const DEFAULT_MAX_HTML_BYTES = 2 * 1024 * 1024;

export interface HtmlParseOptions {
  /** Input size cap in bytes (UTF-8 length). Default {@link DEFAULT_MAX_HTML_BYTES}. */
  maxBytes?: number;
}

export type HtmlParseError =
  | { kind: 'empty'; message: string }
  | { kind: 'tooLarge'; message: string; maxBytes: number }
  | { kind: 'parseFailed'; message: string };

export type HtmlParseResult =
  | { ok: true; root: CheerioAPI }
  | { ok: false; error: HtmlParseError };

/**
 * Parses HTML into a cheerio root. Never throws: oversized, empty or
 * hostile input is reported as a typed error result.
 */
export function parseHtml(html: string, options: HtmlParseOptions = {}): HtmlParseResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_HTML_BYTES;
  if (typeof html !== 'string') {
    return { ok: false, error: { kind: 'empty', message: 'HTML input must be a string' } };
  }
  if (Buffer.byteLength(html, 'utf8') > maxBytes) {
    return {
      ok: false,
      error: {
        kind: 'tooLarge',
        message: `HTML input exceeds the ${maxBytes}-byte limit`,
        maxBytes,
      },
    };
  }
  if (html.trim() === '') {
    return { ok: false, error: { kind: 'empty', message: 'HTML input is empty' } };
  }
  try {
    return { ok: true, root: cheerio.load(html) };
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: 'parseFailed',
        message: `cheerio failed to parse the document: ${describe(cause)}`,
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Extraction helpers (take a parsed root; never throw)                        */
/* -------------------------------------------------------------------------- */

/** Trimmed text of the FIRST element matching `selector`, or '' when absent. */
export function extractText(root: CheerioAPI, selector: string): string {
  return root(selector).first().text().trim();
}

/** Trimmed, non-empty texts of ALL elements matching `selector`, in document order. */
export function extractAllText(root: CheerioAPI, selector: string): string[] {
  const out: string[] = [];
  root(selector).each((_i, el) => {
    const text = root(el).text().trim();
    if (text !== '') out.push(text);
  });
  return out;
}

/** Attribute value of the FIRST match, or `null` when the element/attribute is absent. */
export function extractAttribute(
  root: CheerioAPI,
  selector: string,
  attribute: string,
): string | null {
  const value = root(selector).first().attr(attribute);
  return value === undefined ? null : value;
}

/** A hyperlink extracted from an `<a href>`. `url` is null unless absolutizable to http(s). */
export interface ExtractedLink {
  /** Raw href attribute exactly as it appeared (may be relative/empty). */
  href: string;
  /** Absolute http(s) URL when resolvable, otherwise null. */
  url: string | null;
  /** Trimmed link text (may be empty for image links). */
  text: string;
}

/**
 * Collects `<a href>` links in document order, absolutizing against `baseUrl`
 * when provided. Unresolvable or non-http(s) targets (`javascript:`,
 * `mailto:`, …) keep their raw `href` with `url: null` — they are never
 * fetched by anything in this project.
 */
export function extractLinks(root: CheerioAPI, baseUrl?: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  root('a[href]').each((_i, el) => {
    const href = root(el).attr('href') ?? '';
    links.push({ href, url: absolutizeUrl(href, baseUrl), text: root(el).text().trim() });
  });
  return links;
}

/**
 * Absolutizes `href` against `baseUrl`. Returns null when either side is
 * unusable or the result is not http(s). Never throws.
 */
export function absolutizeUrl(href: string, baseUrl?: string): string | null {
  if (typeof href !== 'string' || href.trim() === '') return null;
  if (baseUrl === undefined || baseUrl.trim() === '') return null;
  try {
    const resolved = new URL(href, baseUrl);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/** Structured page metadata — bounded, deterministic, safe to log. */
export interface PageMetadata {
  /** `<title>` text ('' when absent). */
  title: string;
  /** `meta[name=description]` content, or null. */
  description: string | null;
  /** `link[rel=canonical]` href (raw, not absolutized), or null. */
  canonical: string | null;
  /** `meta[property^="og:"]` content values, capped (see {@link MAX_META_ENTRIES}). */
  openGraph: Record<string, string>;
}

/** Cap on captured `meta[property]` entries — hostile pages cannot balloon this object. */
export const MAX_META_ENTRIES = 64;

/**
 * Extracts title, description, canonical URL and OpenGraph properties.
 * Values are trimmed; entries beyond {@link MAX_META_ENTRIES} are ignored.
 */
export function extractMetadata(root: CheerioAPI): PageMetadata {
  const openGraph: Record<string, string> = {};
  let captured = 0;
  root('meta[property]').each((_i, el) => {
    if (captured >= MAX_META_ENTRIES) return;
    const property = root(el).attr('property');
    const content = root(el).attr('content');
    if (property === undefined || content === undefined) return;
    if (!property.startsWith('og:')) return;
    const key = property.slice('og:'.length);
    if (key === '' || key in openGraph) return;
    openGraph[key] = content.trim();
    captured += 1;
  });

  const description = root('meta[name="description"]').first().attr('content');

  return {
    title: extractText(root, 'title'),
    description: description === undefined ? null : description.trim() || null,
    canonical: extractAttribute(root, 'link[rel="canonical"]', 'href'),
    openGraph,
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
