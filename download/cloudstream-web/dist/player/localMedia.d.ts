/**
 * Local-file pipeline: bounded head sniffing (4 KiB — never the whole file),
 * source construction with object-URL lifecycle, and subtitle file intake.
 * Local media NEVER leaves the device: no upload code path exists anywhere
 * in the player (owner instruction; D21.6).
 */
import type { LocalFileInspection, ObjectUrlRegistry, PlayerSource } from './types';
/** Head slice read for signature sniffing. */
export declare const SNIFF_HEAD_BYTES = 4096;
export type HeadReader = (file: Blob, byteCount: number) => Promise<Uint8Array>;
/** Default reader: Blob.slice().arrayBuffer() — incremental, not whole-file. */
export declare const defaultHeadReader: HeadReader;
/**
 * Inspects a local file by reading ONLY the first {@link SNIFF_HEAD_BYTES}
 * bytes and identifying the container from its signature. Missing/invalid
 * headers yield `container: 'unknown'` (graceful — never an exception for
 * merely unrecognized content).
 */
export declare function inspectLocalFile(file: File, readHead?: HeadReader): Promise<LocalFileInspection>;
/**
 * Builds a `PlayerSource` for a local file, creating its object URL through
 * the registry (so removal/dispose revokes it deterministically).
 */
export declare function localFileToSource(file: File, inspection: LocalFileInspection, urls: ObjectUrlRegistry, id: string): PlayerSource;
/** Sanitizes a filename into a wasm-FFmpeg-safe virtual name (no paths, ascii). */
export declare function safeVirtualName(name: string, fallbackExt: string): string;
/**
 * Reads a local subtitle file and returns WebVTT text. Content decides —
 * .srt/.vtt names are hints; content validation is authoritative.
 */
export declare function readSubtitleAsVtt(file: File, label: string, readText?: (file: File) => Promise<string>): Promise<{
    vtt: string;
    wasSrt: boolean;
}>;
//# sourceMappingURL=localMedia.d.ts.map