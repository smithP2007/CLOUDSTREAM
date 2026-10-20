/**
 * Local-file pipeline: bounded head sniffing (4 KiB — never the whole file),
 * source construction with object-URL lifecycle, and subtitle file intake.
 * Local media NEVER leaves the device: no upload code path exists anywhere
 * in the player (owner instruction; D21.6).
 */
import { detectContainer, containerMime } from './formatSupport';
import { PlaybackError } from './errors';
import { ensureVtt, looksLikeSrt, looksLikeVtt } from './srtToVtt';
/** Head slice read for signature sniffing. */
export const SNIFF_HEAD_BYTES = 4096;
/** Default reader: Blob.slice().arrayBuffer() — incremental, not whole-file. */
export const defaultHeadReader = async (file, byteCount) => {
    const buffer = await file.slice(0, byteCount).arrayBuffer();
    return new Uint8Array(buffer);
};
/**
 * Inspects a local file by reading ONLY the first {@link SNIFF_HEAD_BYTES}
 * bytes and identifying the container from its signature. Missing/invalid
 * headers yield `container: 'unknown'` (graceful — never an exception for
 * merely unrecognized content).
 */
export async function inspectLocalFile(file, readHead = defaultHeadReader) {
    const bytes = await readHead(file, SNIFF_HEAD_BYTES);
    const container = detectContainer(bytes);
    return {
        container,
        mime: containerMime(container),
        sizeBytes: file.size,
        fileName: file.name,
    };
}
/**
 * Builds a `PlayerSource` for a local file, creating its object URL through
 * the registry (so removal/dispose revokes it deterministically).
 */
export function localFileToSource(file, inspection, urls, id) {
    return {
        id,
        kind: 'local-file',
        url: urls.create(file),
        label: file.name,
        mimeHint: inspection.mime || (file.type || null),
        localFile: file,
        link: null,
        sizeBytes: file.size,
        inspection,
    };
}
/** Sanitizes a filename into a wasm-FFmpeg-safe virtual name (no paths, ascii). */
export function safeVirtualName(name, fallbackExt) {
    const base = name.split(/[\\/]/).pop() ?? 'input';
    const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
    return cleaned.length > 0 && cleaned.includes('.') ? cleaned : `input.${fallbackExt}`;
}
/**
 * Reads a local subtitle file and returns WebVTT text. Content decides —
 * .srt/.vtt names are hints; content validation is authoritative.
 */
export async function readSubtitleAsVtt(file, label, readText = (f) => f.text()) {
    const text = await readText(file);
    if (!looksLikeVtt(text) && !looksLikeSrt(text)) {
        throw new PlaybackError('unsupported-format', `Subtitle "${label}" is neither WebVTT nor SubRip; only .vtt and .srt are supported.`);
    }
    return { vtt: ensureVtt(text, label), wasSrt: looksLikeSrt(text) && !looksLikeVtt(text) };
}
//# sourceMappingURL=localMedia.js.map