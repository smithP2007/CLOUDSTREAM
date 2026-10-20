/**
 * Player-facing error vocabulary (mirrors the host philosophy of D13: failures
 * are typed VALUES surfaced to the UI, never crashes and never raw internals).
 *
 * Error messages are composed from OUR code only — they must never embed raw
 * provider URLs, credentials or response bodies (D19 redaction discipline).
 */
export type PlaybackErrorCode = 
/** Source descriptor failed validation (bad scheme, unparseable URL, empty). */
'invalid-source'
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
/** Anything not covered above. */
 | 'unknown';
/** Typed playback failure. `detail` carries extra operator-facing context (no URLs). */
export declare class PlaybackError extends Error {
    readonly code: PlaybackErrorCode;
    readonly detail?: string;
    constructor(code: PlaybackErrorCode, message?: string, detail?: string);
}
/** Maps an error-like thrown value onto the typed vocabulary. Never throws. */
export declare function toPlaybackError(value: unknown, fallbackCode?: PlaybackErrorCode): PlaybackError;
//# sourceMappingURL=errors.d.ts.map