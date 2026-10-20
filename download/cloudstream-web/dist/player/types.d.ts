/**
 * Player value types. The provider contract (`src/core/types.ts`) is reused
 * verbatim — the player introduces NO new media/link vocabulary (D21.3).
 */
import type { PlaybackLink, SubtitleFile } from '../core/types';
import type { PlaybackError } from './errors';
import type { ConversionProfile } from './conversion/profiles';
import type { ConversionAvailability } from './playbackDecision';
export type { PlaybackLink, SubtitleFile };
/** Playback strategy identifier. */
export type EngineId = 'native' | 'hls' | 'dash';
/** `<video>.canPlayType` vocabulary. */
export type CanPlayResult = '' | 'maybe' | 'probably';
/**
 * What the environment can do. Produced by runtime probes only — file
 * extensions and URL shapes are never treated as capability proof (D21.2).
 */
export interface MediaCapabilities {
    /** true when `MediaSource` exists and accepts a baseline MP4 type. */
    readonly hasMse: boolean;
    /** Delegate to a real media element's `canPlayType` (or a test fake). */
    canPlayType(mediaType: string): CanPlayResult;
}
/** How a source reaches the player. */
export type SourceKind = 'local-file' | 'progressive' | 'hls' | 'dash';
/**
 * A normalized playable source. URLs are either http(s) (remote) or blob:
 * object URLs created from local files (which NEVER leave the device, D21.6).
 */
export interface PlayerSource {
    readonly id: string;
    readonly kind: SourceKind;
    /** http(s) URL or blob: object URL. */
    readonly url: string;
    /** Human label (filename for local files, link name for provider links). */
    readonly label: string;
    /** MIME hint when known (local sniffing / provider type). May be null. */
    readonly mimeHint?: string | null;
    /** The local file backing this source, when local. Stays on the device. */
    readonly localFile?: Blob | null;
    /** The provider link backing this source, when remote. */
    readonly link?: PlaybackLink | null;
    readonly sizeBytes?: number | null;
    /** Local-file container sniffing result (local sources only). */
    readonly inspection?: LocalFileInspection | null;
}
/** Result of local-file head sniffing (bounded 4 KiB read, never whole file). */
export interface LocalFileInspection {
    readonly container: string;
    readonly mime: string;
    readonly sizeBytes: number;
    readonly fileName: string;
}
/** One selectable subtitle track (provider or local origin). */
export interface SubtitleTrackInput {
    readonly id: string;
    readonly label: string;
    readonly language: string;
    /** Remote URL (provider) — loaded via CORS-checked fetch, then served locally. */
    readonly url?: string | null;
    /** Local subtitle file (stays on device; converted to VTT if SRT). */
    readonly localFile?: Blob | null;
    readonly filename?: string | null;
    readonly origin: 'provider' | 'local';
}
/** View model of a subtitle track in controller state. */
export interface SubtitleTrackView {
    readonly id: string;
    readonly label: string;
    readonly language: string;
    readonly origin: 'provider' | 'local';
    /** true once the track text is loaded and locally servable (or still remote attempt). */
    readonly ready: boolean;
}
/** Playlist item as exposed to the UI. */
export interface PlaylistItemView {
    readonly id: string;
    readonly label: string;
    readonly kind: SourceKind;
    readonly sizeBytes: number | null;
    readonly engineId: EngineId | null;
    /** Per-item lifecycle note (e.g. "needs conversion", "needs relay"). */
    readonly note: string | null;
    /** Short kind badge for the UI (e.g. MP4 / HLS / DASH / AVI / FILE). */
    readonly badge: string;
}
export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
/** Renderable error (message composed by us; never raw internals). */
export interface PlaybackErrorView {
    readonly code: string;
    readonly message: string;
    readonly sourceId: string | null;
}
/** Immutable UI snapshot (consumed via `useSyncExternalStore`). */
export interface PlaybackState {
    readonly status: PlaybackStatus;
    readonly currentIndex: number;
    readonly items: readonly PlaylistItemView[];
    readonly currentTimeSec: number;
    readonly durationSec: number;
    readonly bufferedSec: number;
    readonly volume: number;
    readonly muted: boolean;
    readonly rate: number;
    readonly engineId: EngineId | null;
    readonly error: PlaybackErrorView | null;
    /** Human-readable notice, e.g. "skipped source X after an error". */
    readonly notice: string | null;
    /** Explanation of how the active source is being played. */
    readonly lastDecision: string | null;
    readonly subtitles: readonly SubtitleTrackView[];
    readonly activeSubtitleId: string | null;
    /** Present when the active item needs an explicit user conversion action. */
    readonly conversionOffer: ConversionOfferView | null;
}
export interface ConversionOfferView {
    readonly itemId: string;
    /** e.g. "MKV (Matroska) -> MP4 (H.264 + AAC)". */
    readonly profileLabel: string;
    readonly reason: string;
    /** The concrete output profile the conversion engine will run. */
    readonly profile: ConversionProfile;
}
/** Attach-time options for engines. */
export interface EngineAttachOptions {
    readonly autoplay: boolean;
    /** Engine hit a fatal error — the controller will stop or fall back. */
    readonly onFatal: (error: PlaybackError) => void;
    /** Engine recovered or reports a non-fatal problem (notice only). */
    readonly onNotice: (message: string) => void;
}
/** A started playback session. Destroy on replace/dispose — no leaks. */
export interface EngineSession {
    readonly engineId: EngineId;
    destroy(): void;
}
/**
 * A playback strategy. Engines must clean up every resource they create in
 * `destroy()` (library instances, event listeners, media element state).
 */
export interface PlaybackEngine {
    readonly id: EngineId;
    /** Light support check used before attach; the decision flow is authoritative. */
    canPlay(source: PlayerSource, caps: MediaCapabilities): {
        supported: boolean;
        reason: string;
    };
    attach(media: HTMLMediaElement, source: PlayerSource, options: EngineAttachOptions): Promise<EngineSession>;
}
/** Lazy engine factory (hls.js/dash.js are dynamic-imported, never static). */
export type EngineFactory = () => Promise<PlaybackEngine>;
export interface EngineRegistry {
    register(id: EngineId, factory: EngineFactory): void;
    has(id: EngineId): boolean;
    /** Cached-per-id promise; a failed factory is NOT cached (retry allowed). */
    get(id: EngineId): Promise<PlaybackEngine> | undefined;
}
/** Minimal controller option surface (all injectable for tests). */
export interface PlaybackControllerOptions {
    readonly engines?: EngineRegistry;
    readonly objectUrls?: ObjectUrlRegistry;
    /** Max sources attempted per play action before surfacing the error. */
    readonly maxSourceAttempts?: number;
    readonly autoplay?: boolean;
    /** Conversion availability override (defaults to a runtime environment probe). */
    readonly conversion?: ConversionAvailability;
}
/** Object URL lifecycle owner (create/revoke; revokeAll on dispose). */
export interface ObjectUrlRegistry {
    create(blob: Blob): string;
    revoke(url: string): void;
    revokeAll(): void;
    readonly size: number;
}
/** Convert `SubtitleFile[]` into selectable tracks. */
export declare function subtitleInputsFromProvider(subtitles: readonly SubtitleFile[]): SubtitleTrackInput[];
/** Convert a `PlaybackLink` into a `PlayerSource` (contract-faithful). */
export declare function playerSourceFromLink(link: PlaybackLink, idSuffix: string): PlayerSource;
//# sourceMappingURL=types.d.ts.map