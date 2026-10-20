/**
 * Headless playback controller — the framework-agnostic heart of the player
 * (D21.1). Owns, in one place:
 *
 *  - the unified playlist (local files first, provider links after);
 *  - the decision flow invocation per source (playbackDecision.ts);
 *  - engine lifecycle (attach on play, destroy on replace/dispose — no leaks);
 *  - bounded source fallback (engine fatal errors try the next compatible
 *    source at most `maxSourceAttempts` times — no infinite retry loops);
 *  - object-URL lifecycle via {@link ObjectUrlRegistry} (create/revoke;
 *    revokeAll on dispose);
 *  - subtitle intake (local SRT->VTT conversion; provider tracks fetched once,
 *    CORS-checked, converted when SubRip) and <track> rendering;
 *  - a typed state machine exposed as an immutable snapshot for
 *    `useSyncExternalStore`.
 *
 * React never owns playback state; the controller never imports React.
 */
import type { PlaybackLink, SubtitleFile } from '../core/types';
import type { PlaybackControllerOptions, PlaybackState } from './types';
export declare class PlaybackController {
    private readonly engines;
    private readonly urls;
    private readonly maxSourceAttempts;
    private readonly autoplay;
    private readonly conversion;
    private media;
    private session;
    private mediaListeners;
    private localItems;
    private providerItems;
    private currentIndex;
    private currentAttempts;
    private subs;
    private activeSubtitleId;
    private activeTrackEl;
    private status;
    private error;
    private notice;
    private lastDecision;
    private conversionOffer;
    private currentTimeSec;
    private durationSec;
    private bufferedSec;
    private readonly volume;
    private listeners;
    private snapshot;
    private loadToken;
    private disposed;
    /** True after dispose() — used by the React hook to swap in a fresh instance. */
    get isDisposed(): boolean;
    constructor(options?: PlaybackControllerOptions);
    subscribe: (listener: () => void) => (() => void);
    getState: () => PlaybackState;
    private emit;
    private buildSnapshot;
    private items;
    /** Idempotent. Passing null detaches. Re-attach resumes the current item. */
    attachElement(el: HTMLMediaElement | null): void;
    private installMediaListeners;
    private removeMediaListeners;
    private setStatus;
    /** Aligns the state machine with the element's actual playback state. */
    private syncStatusFromElement;
    /** Adds provider links (sorted quality-desc, deduped via the CORE helpers). */
    setProviderLinks(links: readonly PlaybackLink[]): void;
    /** Adds provider subtitles (deduped per (language, url) by the CORE helpers). */
    setProviderSubtitles(subtitles: readonly SubtitleFile[]): void;
    /** Inspects + appends local files (bounded 4 KiB head read per file). */
    addLocalFiles(files: readonly File[]): Promise<void>;
    /** Adds a converted blob (client-side conversion output) to the playlist. */
    addLocalBlob(blob: Blob, name: string, convertedFrom?: string): Promise<void>;
    /** The original local file behind an item (conversion input). */
    getLocalFile(itemId: string): File | null;
    /** Dismisses the current conversion offer (user chose not to convert). */
    clearConversionOffer(): void;
    removeItem(itemId: string): void;
    clearPlaylist(): void;
    private restoreCurrentIndex;
    /** Explicit selection: the chosen item's failure is shown honestly (no auto-skip). */
    playIndex(index: number, _allowFallback?: boolean): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    private attemptIndex;
    /** Shows the error for the current item; fallback only via handleFatal chains. */
    private failCurrent;
    /** Engine-fatal path: bounded fallback to the next attemptable source. */
    private handleFatal;
    /** Forward scan for the next source whose decision is attemptable. */
    private nextAttemptableIndex;
    private stopSession;
    play(): void;
    pause(): void;
    togglePlay(): void;
    seek(seconds: number): void;
    seekBy(delta: number): void;
    setVolume(volume: number): void;
    toggleMute(): void;
    setRate(rate: number): void;
    private setNotice;
    /** Adds local subtitle files (SRT converted to VTT; content decides format). */
    addSubtitleFiles(files: readonly File[]): Promise<void>;
    /** Selects a subtitle track (or null = off). Provider tracks fetch once. */
    setSubtitle(id: string | null): Promise<void>;
    private renderActiveTrack;
    private removeActiveTrack;
    /** Idempotent: destroys the engine session, listeners, and every object URL. */
    dispose(): void;
}
//# sourceMappingURL=PlaybackController.d.ts.map