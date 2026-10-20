/**
 * Subtitle selector: "Off" plus every track (provider + local). Selection
 * triggers the controller's track pipeline (fetch-once for provider tracks,
 * SRT->VTT conversion, local blob serving).
 */
import type { SubtitleTrackView } from './types';
export interface SubtitleSelectorProps {
    tracks: readonly SubtitleTrackView[];
    activeId: string | null;
    onSelect(trackId: string | null): void;
    onAddFiles(files: File[]): void;
}
export declare function SubtitleSelector({ tracks, activeId, onSelect, onAddFiles }: SubtitleSelectorProps): import("react").JSX.Element | null;
//# sourceMappingURL=SubtitleSelector.d.ts.map