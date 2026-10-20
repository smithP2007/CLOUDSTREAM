/**
 * Playlist panel: local files + provider entries with per-item status,
 * selection, removal, and clear-all. Shows filename/kind/size/status.
 */
import type { PlaylistItemView } from './types';
export interface PlaylistPanelProps {
    items: readonly PlaylistItemView[];
    currentIndex: number;
    onSelect(index: number): void;
    onRemove(itemId: string): void;
    onClear(): void;
}
export declare function PlaylistPanel({ items, currentIndex, onSelect, onRemove, onClear }: PlaylistPanelProps): import("react").JSX.Element | null;
//# sourceMappingURL=PlaylistPanel.d.ts.map