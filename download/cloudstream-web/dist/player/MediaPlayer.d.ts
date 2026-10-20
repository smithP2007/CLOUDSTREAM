/**
 * MediaPlayer — the polished player surface (owner instruction §8).
 *
 * Composition: video stage + full transport controls + keyboard navigation +
 * provider source selector + subtitle selector + playlist + local picker +
 * conversion panel. All playback state lives in the headless controller;
 * this component only renders snapshots and forwards intents (D21.1).
 *
 * Error states are explicit (loading / buffering / unsupported / network /
 * relay-required); there is no silent failure and no auto-transcode.
 */
import type { PlaybackLink, SubtitleFile } from '../core/types';
import type { PlaybackControllerOptions } from './types';
import './player.css';
export interface MediaPlayerProps {
    /** Provider sources (PlaybackLink[]) — played directly, never proxied. */
    readonly links?: readonly PlaybackLink[];
    readonly subtitles?: readonly SubtitleFile[];
    /** Show the local-file picker + local subtitle intake (default true). */
    readonly showLocalPicker?: boolean;
    /** Initial controller configuration (read once on mount). */
    readonly controllerOptions?: PlaybackControllerOptions;
    /** ffmpeg.wasm core base URL (self-hosted); default is the pinned CDN. */
    readonly conversionCoreBaseUrl?: string;
    readonly className?: string;
    readonly ariaLabel?: string;
}
export declare function MediaPlayer({ links, subtitles, showLocalPicker, controllerOptions, conversionCoreBaseUrl, className, ariaLabel, }: MediaPlayerProps): import("react").JSX.Element;
//# sourceMappingURL=MediaPlayer.d.ts.map