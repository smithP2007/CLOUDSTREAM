/**
 * Client-side conversion engine (ffmpeg.wasm) — OPTIONAL, LAZY, LOCAL-ONLY.
 *
 * Hard rules (owner instruction §5; decisions D21.5/D22):
 *  - the library is dynamically imported only when a conversion actually runs;
 *  - the GPL-licensed core (@ffmpeg/core) is NEVER bundled or committed — it is
 *    loaded at runtime from a self-hosted path (demo) or the pinned CDN;
 *  - input files stay on the device (the wasm FFmpeg reads the Blob directly);
 *  - bounded input size (default 1.5 GiB), cancellable (worker terminate),
 *    progress is best-effort (upstream marks the hook experimental);
 *  - a browser without Worker/WASM reports typed unavailability instead of
 *    attempting anything;
 *  - the engine takes FFmpeg ARGV directly (no shell anywhere — nothing to
 *    inject into).
 */
import { type ConversionProfile } from './profiles';
/** Minimal structural view of the @ffmpeg/ffmpeg module we use. */
export interface FfmpegInstanceLike {
    on(event: 'log', callback: (event: {
        message: string;
    }) => void): void;
    on(event: 'progress', callback: (event: {
        progress: number;
    }) => void): void;
    load(options: {
        coreURL: string;
        wasmURL: string;
    }): Promise<boolean>;
    writeFile(name: string, data: Uint8Array): Promise<boolean>;
    readFile(name: string): Promise<Uint8Array | string>;
    deleteFile(name: string): Promise<boolean>;
    exec(args: string[], timeoutMs?: number): Promise<number>;
    terminate(): void;
}
export interface FfmpegModuleLike {
    FFmpeg: new () => FfmpegInstanceLike;
}
export interface FfmpegUtilLike {
    toBlobURL(url: string, mimeType: string): Promise<string>;
    fetchFile(file: Blob | URL | string): Promise<Uint8Array>;
}
export type FfmpegLibraryLoader = () => Promise<{
    module: FfmpegModuleLike;
    util: FfmpegUtilLike;
}>;
export declare const defaultFfmpegLoader: FfmpegLibraryLoader;
export interface ConversionEngineOptions {
    /** Library loader seam (tests inject fakes; default = real dynamic imports). */
    loadLibraries?: FfmpegLibraryLoader;
    /** Core base URL (self-hosted path); defaults to the pinned CDN. */
    coreBaseUrl?: string;
    maxInputBytes?: number;
    /** exec() kill switch; conversion is bounded in time as well as size. */
    execTimeoutMs?: number;
    /** Environment override for tests (defaults to globalThis). */
    env?: {
        Worker?: unknown;
        WebAssembly?: unknown;
    };
}
export declare const DEFAULT_CORE_CDN_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
export interface ConversionResult {
    blob: Blob;
    outputName: string;
    durationMs: number;
}
export interface ConversionRequest {
    profile: ConversionProfile;
    inputName?: string;
    onProgress?: (ratio: number) => void;
    signal?: AbortSignal;
}
export interface ConversionEngine {
    /** Static environment probe: no worker/WASM means conversion cannot run. */
    readonly availability: {
        available: boolean;
        reason?: string;
    };
    convert(file: Blob, request: ConversionRequest): Promise<ConversionResult>;
    dispose(): void;
}
export declare function probeConversionEnvironment(env?: {
    Worker?: unknown;
    WebAssembly?: unknown;
}): {
    available: boolean;
    reason?: string;
};
export declare function createConversionEngine(options?: ConversionEngineOptions): ConversionEngine;
//# sourceMappingURL=ffmpegConversion.d.ts.map