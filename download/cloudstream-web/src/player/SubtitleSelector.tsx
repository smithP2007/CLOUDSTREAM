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

export function SubtitleSelector({ tracks, activeId, onSelect, onAddFiles }: SubtitleSelectorProps) {
  if (tracks.length === 0 && !onAddFiles) return null;
  return (
    <section className="csw-panel" aria-label="Subtitles">
      <h3 className="csw-panel-title">Subtitles</h3>
      {tracks.length > 0 ? (
        <div className="csw-sub-list" role="radiogroup" aria-label="Subtitle track">
          <button
            type="button"
            role="radio"
            aria-checked={activeId === null}
            className={`csw-sub-item${activeId === null ? ' is-active' : ''}`}
            onClick={() => onSelect(null)}
          >
            Off
          </button>
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              role="radio"
              aria-checked={activeId === track.id}
              className={`csw-sub-item${activeId === track.id ? ' is-active' : ''}`}
              title={track.ready ? undefined : 'Will be loaded when selected'}
              onClick={() => onSelect(track.id)}
            >
              {track.label}
              <span className="csw-sub-origin">{track.origin}</span>
            </button>
          ))}
        </div>
      ) : null}
      {onAddFiles ? (
        <label className="csw-sub-add">
          <input
            type="file"
            accept=".vtt,.srt,text/vtt,application/x-subrip"
            multiple
            aria-label="Add local subtitle files (VTT or SRT)"
            data-testid="csw-subtitle-input"
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) onAddFiles(Array.from(files));
              event.target.value = '';
            }}
          />
          <span className="csw-dropzone-hint">Add .vtt / .srt from your device</span>
        </label>
      ) : null}
    </section>
  );
}
