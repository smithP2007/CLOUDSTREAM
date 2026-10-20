/**
 * React binding for the headless {@link PlaybackController}: one controller
 * instance per component lifetime, snapshot state via useSyncExternalStore,
 * and dispose-on-unmount. React NEVER owns playback state (D21.1).
 *
 * StrictMode note (documented in docs/media-compatibility.md): React's
 * mount->cleanup->mount simulation disposes the instance and re-runs effects
 * WITHOUT an intervening render, so a strictly-correct "dispose on cleanup"
 * hook must also swap the instance when the render body observes disposal.
 * The dev-only demo page runs without StrictMode; the Phase 5 app shell must
 * make (and record) its own StrictMode decision when integrating this hook.
 */
import { PlaybackController } from './PlaybackController';
import type { PlaybackControllerOptions, PlaybackState } from './types';
import type { PlaybackLink, SubtitleFile } from '../core/types';
export interface MediaPlayerActions {
    play(): void;
    pause(): void;
    togglePlay(): void;
    seek(seconds: number): void;
    seekBy(delta: number): void;
    setVolume(volume: number): void;
    toggleMute(): void;
    setRate(rate: number): void;
    playIndex(index: number): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    removeItem(itemId: string): void;
    clearPlaylist(): void;
    setSubtitle(trackId: string | null): Promise<void>;
    addLocalFiles(files: File[]): Promise<void>;
    addSubtitleFiles(files: File[]): Promise<void>;
}
export interface UsePlaybackControllerArgs {
    readonly controllerOptions?: PlaybackControllerOptions;
    /** Provider sources (PlaybackLink list) — replaced on identity change. */
    readonly links?: readonly PlaybackLink[];
    /** Provider subtitles — replaced on identity change. */
    readonly subtitles?: readonly SubtitleFile[];
}
export interface UsePlaybackControllerResult {
    readonly controller: PlaybackController;
    readonly state: PlaybackState;
    readonly actions: MediaPlayerActions;
}
export declare function usePlaybackController(args?: UsePlaybackControllerArgs): UsePlaybackControllerResult;
//# sourceMappingURL=usePlaybackController.d.ts.map