/**
 * Player-facing error vocabulary (mirrors the host philosophy of D13: failures
 * are typed VALUES surfaced to the UI, never crashes and never raw internals).
 *
 * Error messages are composed from OUR code only — they must never embed raw
 * provider URLs, credentials or response bodies (D19 redaction discipline).
 */
const CODE_MESSAGES = {
    'invalid-source': 'This source is not a valid playable URL.',
    'unsupported-format': 'This format cannot be played in this browser.',
    'relay-required': 'This source needs request headers that browsers cannot send directly; playback requires the authenticated media relay (not built yet).',
    'engine-missing': 'No playback engine is available for this source type.',
    'network-error': 'The media could not be loaded (network error).',
    'manifest-error': 'The streaming manifest could not be read or parsed.',
    'decoding-error': 'The browser could not decode this media.',
    aborted: 'Playback was cancelled.',
    'conversion-failed': 'Converting this file failed.',
    'conversion-too-large': 'This file is too large to convert in the browser.',
    'conversion-unavailable': 'Conversion is not available in this browser.',
    unknown: 'Playback failed for an unknown reason.',
};
/** Typed playback failure. `detail` carries extra operator-facing context (no URLs). */
export class PlaybackError extends Error {
    code;
    detail;
    constructor(code, message, detail) {
        super(message ?? CODE_MESSAGES[code]);
        this.name = 'PlaybackError';
        this.code = code;
        if (detail !== undefined)
            this.detail = detail;
    }
}
/** Maps an error-like thrown value onto the typed vocabulary. Never throws. */
export function toPlaybackError(value, fallbackCode = 'unknown') {
    if (value instanceof PlaybackError)
        return value;
    if (value instanceof DOMException && value.name === 'AbortError') {
        return new PlaybackError('aborted');
    }
    const message = value instanceof Error ? value.message : undefined;
    return new PlaybackError(fallbackCode, message ? `${CODE_MESSAGES[fallbackCode]} (${message})` : undefined);
}
//# sourceMappingURL=errors.js.map