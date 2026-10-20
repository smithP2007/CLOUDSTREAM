/**
 * HLS engine. The library (hls.js, Apache-2.0) is DYNAMICALLY IMPORTED only
 * when an HLS source plays — it never appears in the initial bundle (D22.1).
 *
 * Selection logic:
 *  - MSE available  -> hls.js (with bounded retry configuration);
 *  - no MSE but native HLS (`application/vnd.apple.mpegurl`, Safari) -> plain `src`;
 *  - neither        -> unsupported (the decision flow reports it before attach).
 *
 * Manifest/segment failures map onto the typed playback error vocabulary;
 * fatal errors call `onFatal` ONCE so the controller can fall back bounded.
 */
import type { PlaybackEngine } from '../types';
/** Minimal structural view of the hls.js module surface we use. */
export interface HlsInstanceLike {
    on(event: string, callback: (data: unknown) => void): void;
    off?(event: string, callback: (data: unknown) => void): void;
    loadSource(url: string): void;
    attachMedia(media: HTMLMediaElement): void;
    startLoad(): void;
    destroy(): void;
}
export type HlsConstructor = (new (config?: Record<string, unknown>) => HlsInstanceLike) & {
    isSupported(): boolean;
    Events: {
        readonly ERROR: string;
    };
};
export type HlsLibraryLoader = () => Promise<HlsConstructor>;
/** Default loader: dynamic import — erased from the static graph. */
export declare const defaultHlsLoader: HlsLibraryLoader;
export interface HlsErrorData {
    readonly type?: unknown;
    readonly details?: unknown;
    readonly fatal?: unknown;
}
export declare function createHlsEngine(options?: {
    loadLibrary?: HlsLibraryLoader;
}): PlaybackEngine;
//# sourceMappingURL=hlsEngine.d.ts.map