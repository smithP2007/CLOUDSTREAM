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

export function SourceSelector({ items, currentIndex, onSelect }: SourceSelectorProps) {
  const providerItems = items
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item.kind !== 'local-file');

  if (providerItems.length === 0) return null;

  return (
    <section className="csw-panel" aria-label="Provider sources">
      <h3 className="csw-panel-title">Sources</h3>
      <ul className="csw-source-list" role="listbox" aria-label="Select source">
        {providerItems.map(({ item, index }) => {
          const active = index === currentIndex;
          const broken = item.note === 'needs relay (headers required)' || item.note === 'unplayable here';
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`csw-source-item${active ? ' is-active' : ''}`}
                onClick={() => onSelect(index)}
              >
                <span className="csw-source-badge">{item.badge}</span>
                <span className="csw-source-name">{item.label}</span>
                {broken ? <span className="csw-source-note">{item.note}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
