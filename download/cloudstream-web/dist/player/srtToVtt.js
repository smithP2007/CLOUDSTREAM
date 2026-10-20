/**
 * Subtitle text handling: WebVTT detection and SRT -> WebVTT conversion.
 * Pure string transforms on untrusted text — the output is data for a <track>
 * element and is never interpreted as code (D19 spirit applies to subtitles).
 */
import { PlaybackError } from './errors';
const SRT_TIME = /(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
/** Strict SubRip signature: cue timings with COMMA milliseconds. */
const SRT_TIME_STRICT = /(\d{2}):(\d{2}):(\d{2}),(\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{1,3})/;
/** True when the text already looks like WebVTT. */
export function looksLikeVtt(text) {
    return /^WEBVTT(\s|\n|\r|$)/.test(text.slice(0, 16).replace(/^\uFEFF/, ''));
}
/** True when the text looks like SubRip (numbered cues with comma timestamps). */
export function looksLikeSrt(text) {
    return SRT_TIME_STRICT.test(text);
}
/**
 * Converts SubRip text to WebVTT:
 *  - strips the BOM;
 *  - drops SRT cue numbering lines;
 *  - rewrites `HH:MM:SS,mmm` timestamps to `HH:MM:SS.mmm`;
 *  - prepends the `WEBVTT` header.
 * CUE TEXT IS COPIED VERBATIM — it is never sanitized into HTML here; the
 * <track> element renders it as text, never as markup.
 */
export function srtToVtt(srt) {
    const text = srt.replace(/^\uFEFF/, '');
    const lines = text.split(/\r\n|\r|\n/);
    const out = ['WEBVTT', ''];
    let previousWasTiming = false;
    for (const line of lines) {
        const timing = line.match(SRT_TIME);
        if (timing) {
            out.push(`${timing[1]}:${timing[2]}:${timing[3]}.${(timing[4] ?? '0').padEnd(3, '0')} --> ` +
                `${timing[5]}:${timing[6]}:${timing[7]}.${(timing[8] ?? '0').padEnd(3, '0')}`);
            previousWasTiming = true;
            continue;
        }
        // Drop pure numbering lines (digits only) that directly precede a cue.
        if (/^\s*\d+\s*$/.test(line))
            continue;
        // Drop other stray arrows/timings that cannot be parsed instead of guessing.
        if (!previousWasTiming && line.trim() === '' && out.at(-1) === '')
            continue;
        if (line.trim() === '') {
            if (!previousWasTiming && out.at(-1) === '')
                continue;
            out.push('');
            previousWasTiming = false;
            continue;
        }
        out.push(line);
    }
    // Collapse any trailing blank runs.
    while (out.length > 0 && out.at(-1) === '')
        out.pop();
    return out.join('\n') + '\n';
}
/**
 * Ensures the given text is usable as a VTT track:
 *  - WebVTT input passes through;
 *  - SubRip input is converted;
 *  - anything else fails with a typed, non-throwing-ish PlaybackError.
 */
export function ensureVtt(text, label) {
    if (looksLikeVtt(text))
        return text.replace(/^\uFEFF/, '');
    if (looksLikeSrt(text))
        return srtToVtt(text);
    throw new PlaybackError('unsupported-format', `Subtitle "${label}" is neither WebVTT nor SubRip; only .vtt and .srt are supported.`);
}
/** True when a filename suggests SRT (used only as a HINT beside content checks). */
export function filenameHintsSrt(filename) {
    return /\.srt$/i.test(filename);
}
//# sourceMappingURL=srtToVtt.js.map