/**
 * Player-facing error vocabulary (mirrors the host philosophy of D13: failures
 * are typed VALUES surfaced to the UI, never crashes and never raw internals).
 *
 * Error messages are composed from OUR code only — they must never embed raw
 * provider URLs, credentials or response bodies (D19 redaction discipline).
 */

export type PlaybackErrorCode =
  /** Source descriptor failed validation (bad scheme, unparseable URL, empty). */
  | 'invalid-source'
  /** The browser cannot decode this container/codec and no permitted path exists. */
  | 'unsupported-format'
  /** The source requires custom headers/referer — needs the future authenticated relay (D8). */
  | 'relay-required'
  /** No engine registered (or its library failed to load) for the required strategy. */
  | 'engine-missing'
  /** Media or manifest fetch failed (network/DNS/HTTP status). */
  | 'network-error'
  /** A streaming manifest was fetched but could not be parsed/used. */
  | 'manifest-error'
  /** The browser fetched the media but could not decode it. */
  | 'decoding-error'
  /** The caller (or user) cancelled the operation. */
  | 'aborted'
  /** Client-side conversion failed inside the conversion engine. */
  | 'conversion-failed'
  /** Input exceeds the configured conversion size bound. */
  | 'conversion-too-large'
  /** Conversion engine cannot run in this environment (no worker/WASM). */
  | 'conversion-unavailable'
  /** The fetched conversion core failed its pinned SHA-256 integrity check (D25). */
  | 'conversion-core-integrity'
  /** Anything not covered above. */
  | 'unknown';

const CODE_MESSAGES: Readonly<Record<PlaybackErrorCode, string>> = {
  'invalid-source': 'This source is not a valid playable URL.',
  'unsupported-format': 'This format cannot be played in this browser.',
  'relay-required':
    'This source needs request headers that browsers cannot send directly; playback requires the authenticated media relay (not built yet).',
  'engine-missing': 'No playback engine is available for this source type.',
  'network-error': 'The media could not be loaded (network error).',
  'manifest-error': 'The streaming manifest could not be read or parsed.',
  'decoding-error': 'The browser could not decode this media.',
  aborted: 'Playback was cancelled.',
  'conversion-failed': 'Converting this file failed.',
  'conversion-too-large': 'This file is too large to convert in the browser.',
  'conversion-unavailable': 'Conversion is not available in this browser.',
  'conversion-core-integrity': 'The conversion core failed its integrity check and was not loaded.',
  unknown: 'Playback failed for an unknown reason.',
};

/** Typed playback failure. `detail` carries extra operator-facing context (no URLs). */
export class PlaybackError extends Error {
  readonly code: PlaybackErrorCode;
  readonly detail?: string;

  constructor(code: PlaybackErrorCode, message?: string, detail?: string) {
    super(message ?? CODE_MESSAGES[code]);
    this.name = 'PlaybackError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

/** Maps an error-like thrown value onto the typed vocabulary. Never throws. */
export function toPlaybackError(value: unknown, fallbackCode: PlaybackErrorCode = 'unknown'): PlaybackError {
  if (value instanceof PlaybackError) return value;
  if (value instanceof DOMException && value.name === 'AbortError') {
    return new PlaybackError('aborted');
  }
  const message = value instanceof Error ? value.message : undefined;
  return new PlaybackError(fallbackCode, message ? `${CODE_MESSAGES[fallbackCode]} (${message})` : undefined);
}
