/**
 * Provider source/quality selector. Items are the provider playlist entries;
 * per-item decisions (relay-required / unsupported) were computed by the
 * decision flow and surface as disabled options with honest reasons.
 */
import type { PlaylistItemView } from './types';
export interface SourceSelectorProps {
    items: readonly PlaylistItemView[];
    currentIndex: number;
    onSelect(index: number): void;
}
export declare function SourceSelector({ items, currentIndex, onSelect }: SourceSelectorProps): import("react").JSX.Element | null;
//# sourceMappingURL=SourceSelector.d.ts.map