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

function formatSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function PlaylistPanel({ items, currentIndex, onSelect, onRemove, onClear }: PlaylistPanelProps) {
  if (items.length === 0) return null;
  return (
    <section className="csw-panel" aria-label="Playlist">
      <div className="csw-panel-head">
        <h3 className="csw-panel-title">Playlist</h3>
        <button type="button" className="csw-btn csw-btn-ghost" onClick={onClear}>
          Clear all
        </button>
      </div>
      <ol className="csw-playlist">
        {items.map((item, index) => {
          const active = index === currentIndex;
          const size = formatSize(item.sizeBytes);
          return (
            <li
              key={item.id}
              className={`csw-playlist-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
            >
              <button type="button" className="csw-playlist-main" onClick={() => onSelect(index)}>
                <span className="csw-source-badge">{item.badge}</span>
                <span className="csw-playlist-name" title={item.label}>
                  {item.label}
                </span>
                {size ? <span className="csw-playlist-size">{size}</span> : null}
                {item.engineId ? <span className="csw-playlist-status">{item.engineId}</span> : null}
                {item.note ? <span className="csw-playlist-note">{item.note}</span> : null}
              </button>
              <button
                type="button"
                className="csw-btn csw-btn-ghost csw-playlist-remove"
                aria-label={`Remove ${item.label} from playlist`}
                onClick={() => onRemove(item.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
