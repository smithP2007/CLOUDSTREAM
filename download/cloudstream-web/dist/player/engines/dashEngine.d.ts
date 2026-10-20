/**
 * DASH engine via Shaka Player (Apache-2.0) — DYNAMICALLY IMPORTED only when a
 * DASH source plays (D22.1).
 *
 * NOTE (recorded in D22): the package published under the `dash.js` name in the
 * current registry (4.0.1) is NOT the MPEG-DASH player — its typings declare an
 * unrelated React UI kit — so it was REJECTED, and the task-sanctioned
 * alternative (Shaka Player) is used instead. One DASH library per purpose.
 *
 * DASH has no native <video> path, so MSE is a hard requirement (the decision
 * flow reports its absence before attach). DRM-protected manifests are NOT
 * handled (policy D7: no DRM circumvention) — they surface as unsupported.
 *
 * Error mapping (shaka.util.Error.Category): MANIFEST -> manifest-error,
 * NETWORK -> network-error, MEDIA -> decoding-error, DRM -> unsupported;
 * anything else is `unknown`. Fatal errors surface ONCE per session.
 */
import type { PlaybackEngine } from '../types';
/** Minimal structural view of a shaka Player instance. */
export interface ShakaPlayerLike {
    load(uri: string, mimeType?: string, startTime?: number): Promise<unknown>;
    destroy(): Promise<unknown>;
    addEventListener(type: string, listener: (event: unknown) => void): void;
    removeEventListener(type: string, listener: (event: unknown) => void): void;
}
export interface ShakaModuleLike {
    Player: new (media?: HTMLMediaElement | null, container?: HTMLElement | null) => ShakaPlayerLike;
    polyfill: {
        installAll(): void;
    };
    util: {
        Error: {
            readonly Category: {
                readonly NETWORK: number;
                readonly MEDIA: number;
                readonly MANIFEST: number;
                readonly DRM: number;
            };
        };
    };
}
export type ShakaLibraryLoader = () => Promise<ShakaModuleLike>;
/** Default loader: dynamic import — erased from the static graph. */
export declare const defaultShakaLoader: ShakaLibraryLoader;
export declare function createDashEngine(options?: {
    loadLibrary?: ShakaLibraryLoader;
}): PlaybackEngine;
//# sourceMappingURL=dashEngine.d.ts.map