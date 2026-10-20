/**
 * Subtitle text handling: WebVTT detection and SRT -> WebVTT conversion.
 * Pure string transforms on untrusted text — the output is data for a <track>
 * element and is never interpreted as code (D19 spirit applies to subtitles).
 */
/** True when the text already looks like WebVTT. */
export declare function looksLikeVtt(text: string): boolean;
/** True when the text looks like SubRip (numbered cues with comma timestamps). */
export declare function looksLikeSrt(text: string): boolean;
/**
 * Converts SubRip text to WebVTT:
 *  - strips the BOM;
 *  - drops SRT cue numbering lines;
 *  - rewrites `HH:MM:SS,mmm` timestamps to `HH:MM:SS.mmm`;
 *  - prepends the `WEBVTT` header.
 * CUE TEXT IS COPIED VERBATIM — it is never sanitized into HTML here; the
 * <track> element renders it as text, never as markup.
 */
export declare function srtToVtt(srt: string): string;
/**
 * Ensures the given text is usable as a VTT track:
 *  - WebVTT input passes through;
 *  - SubRip input is converted;
 *  - anything else fails with a typed, non-throwing-ish PlaybackError.
 */
export declare function ensureVtt(text: string, label: string): string;
/** True when a filename suggests SRT (used only as a HINT beside content checks). */
export declare function filenameHintsSrt(filename: string): boolean;
//# sourceMappingURL=srtToVtt.d.ts.map