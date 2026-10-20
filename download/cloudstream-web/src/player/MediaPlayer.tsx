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

import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePlaybackController } from './usePlaybackController';
import { LocalFilePicker } from './LocalFilePicker';
import { SourceSelector } from './SourceSelector';
import { SubtitleSelector } from './SubtitleSelector';
import { PlaylistPanel } from './PlaylistPanel';
import { ConversionPanel } from './ConversionPanel';
import { createConversionEngine, type ConversionEngine } from './conversion/ffmpegConversion';
import { pickPreferredSubtitle } from './subtitlePreference';
import type { PlaybackLink, SubtitleFile } from '../core/types';
import type { PlaybackControllerOptions } from './types';
import type { PlaybackController } from './PlaybackController';
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
  /**
   * Preferred subtitle language (app-local user preference). Applied ONCE
   * per (language, track list) when no subtitle is active — an explicit
   * user selection (or deselection) is never overridden.
   */
  readonly preferredSubtitleLanguage?: string | null;
  /**
   * Auto-start playback of the best provider source once the playlist is
   * populated (watch-page product behavior: opening an episode plays it).
   * Runs through the normal decision pipeline (bounded source fallback
   * included); fires at most once per mount and never interrupts a user
   * action (only a still-idle player triggers it). Default false — the dev
   * demo keeps manual start.
   */
  readonly autoStart?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function MediaPlayer({
  links,
  subtitles,
  showLocalPicker = true,
  controllerOptions,
  conversionCoreBaseUrl,
  preferredSubtitleLanguage,
  autoStart = false,
  className,
  ariaLabel = 'Media player',
}: MediaPlayerProps) {
  const { controller, state, actions } = usePlaybackController({ controllerOptions, links, subtitles });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ConversionEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createConversionEngine(
      conversionCoreBaseUrl ? { coreBaseUrl: conversionCoreBaseUrl } : {},
    );
  }

  const attachMedia = useCallback(
    (el: HTMLVideoElement | null) => {
      controller.attachElement(el);
    },
    [controller],
  );

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      /* fullscreen unsupported/refused — non-fatal, ignore */
    }
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault();
          actions.togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          actions.seekBy(5);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          actions.seekBy(-5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          actions.setVolume(Math.min(1, state.volume + 0.1));
          break;
        case 'ArrowDown':
          event.preventDefault();
          actions.setVolume(Math.max(0, state.volume - 0.1));
          break;
        case 'm':
        case 'M':
          event.preventDefault();
          actions.toggleMute();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'n':
        case 'N':
          event.preventDefault();
          void actions.next();
          break;
        case 'p':
        case 'P':
          event.preventDefault();
          void actions.previous();
          break;
        default:
          break;
      }
    },
    [actions, state.volume, toggleFullscreen],
  );

  // Keep the aria-live region informative without spamming.
  useEffect(() => {
    /* state changes re-render; no side effect needed */
  }, [state.status]);

  // Preferred-subtitle auto-selection: fills an EMPTY selection once per
  // (controller, language, track list); explicit user choices are never
  // overridden. Keyed by controller instance because StrictMode's
  // mount->dispose->swap must re-apply on the fresh controller.
  const appliedPreferenceRef = useRef<{ controller: PlaybackController | null; identity: string | null }>({
    controller: null,
    identity: null,
  });
  useEffect(() => {
    if (preferredSubtitleLanguage == null || preferredSubtitleLanguage.length === 0) return;
    if (state.subtitles.length === 0 || state.activeSubtitleId !== null) return;
    const identity = `${preferredSubtitleLanguage}|${state.subtitles.map((track) => track.id).join('|')}`;
    if (appliedPreferenceRef.current.controller === controller && appliedPreferenceRef.current.identity === identity) {
      return;
    }
    appliedPreferenceRef.current = { controller, identity };
    const match = pickPreferredSubtitle(state.subtitles, preferredSubtitleLanguage);
    if (match !== null) void actions.setSubtitle(match);
  }, [controller, preferredSubtitleLanguage, state.subtitles, state.activeSubtitleId, actions]);

  // Auto-start (opt-in): play the best source once through the normal
  // decision pipeline. Keyed by controller instance so StrictMode's
  // mount->dispose->swap starts the FRESH controller exactly once.
  const autoStartRef = useRef<PlaybackController | null>(null);
  useEffect(() => {
    if (!autoStart || autoStartRef.current === controller) return;
    if (state.items.length === 0 || state.status !== 'idle') return;
    autoStartRef.current = controller;
    void actions.playIndex(0);
  }, [autoStart, controller, state.items.length, state.status, actions]);

  const showSourceSelector = state.items.some((item) => item.kind !== 'local-file');

  return (
    <div className={`csw-player${className ? ` ${className}` : ''}`} onKeyDown={onKeyDown} data-testid="csw-player">
      <div className="csw-stage" ref={stageRef}>
        <video
          ref={attachMedia}
          className="csw-video"
          playsInline
          preload="metadata"
          aria-label={ariaLabel}
          data-testid="csw-video"
        />
        {state.status === 'loading' || state.status === 'buffering' ? (
          <div className="csw-overlay" aria-live="polite" aria-busy="true">
            <span className="csw-spinner" aria-hidden="true" />
            <span>{state.status === 'loading' ? 'Loading…' : 'Buffering…'}</span>
          </div>
        ) : null}
        {state.status === 'error' && state.error ? (
          <div className="csw-overlay csw-overlay-error" role="alert" aria-live="assertive">
            <strong>{state.error.message}</strong>
            <span className="csw-error-code">code: {state.error.code}</span>
            {state.error.code === 'relay-required' ? (
              <span className="csw-error-hint">
                Playback of header-gated sources requires the future authenticated media relay (decision D8 scope).
              </span>
            ) : null}
            <div className="csw-overlay-actions">
              {state.currentIndex + 1 < state.items.length ? (
                <button type="button" className="csw-btn" onClick={() => void actions.playIndex(state.currentIndex + 1)}>
                  Next source
                </button>
              ) : null}
              <button type="button" className="csw-btn" onClick={() => actions.play()}>
                Retry
              </button>
            </div>
          </div>
        ) : null}
        {state.notice ? (
          <div className="csw-notice" role="status">
            {state.notice}
          </div>
        ) : null}
      </div>

      <div className="csw-controls">
        <button type="button" className="csw-btn csw-btn-primary" onClick={actions.togglePlay} aria-label={state.status === 'playing' ? 'Pause' : 'Play'}>
          {state.status === 'playing' ? '❚❚' : '▶'}
        </button>
        <span className="csw-time">
          <span aria-label="Current time">{formatTime(state.currentTimeSec)}</span>
          {' / '}
          <span aria-label="Duration">{formatTime(state.durationSec)}</span>
        </span>
        <input
          className="csw-seek"
          type="range"
          min={0}
          max={Math.max(state.durationSec, 0.1)}
          step={0.1}
          value={Math.min(state.currentTimeSec, state.durationSec || 0)}
          aria-label="Seek"
          onChange={(event) => actions.seek(Number(event.target.value))}
        />
        <button type="button" className="csw-btn" onClick={actions.toggleMute} aria-label={state.muted ? 'Unmute' : 'Mute'} aria-pressed={state.muted}>
          {state.muted ? '🔇' : '🔊'}
        </button>
        <input
          className="csw-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={state.muted ? 0 : state.volume}
          aria-label="Volume"
          onChange={(event) => actions.setVolume(Number(event.target.value))}
        />
        <label className="csw-rate">
          <span className="csw-visually-hidden">Playback speed</span>
          <select
            value={String(state.rate)}
            aria-label="Playback speed"
            onChange={(event) => actions.setRate(Number(event.target.value))}
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="csw-btn" onClick={() => void actions.previous()} aria-label="Previous item">
          ⏮
        </button>
        <button type="button" className="csw-btn" onClick={() => void actions.next()} aria-label="Next item">
          ⏭
        </button>
        <button type="button" className="csw-btn" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen">
          ⛶
        </button>
      </div>

      {state.lastDecision ? (
        <p className="csw-decision" title="How this source is being played">
          <strong>Playback mode:</strong> {state.lastDecision}
        </p>
      ) : null}

      {state.conversionOffer && engineRef.current ? (
        <ConversionPanel
          offer={state.conversionOffer}
          engine={engineRef.current}
          getInputFile={(itemId) => controller.getLocalFile(itemId)}
          onResult={(blob, name, convertedFrom) => controller.addLocalBlob(blob, name, convertedFrom)}
          onDismiss={() => controller.clearConversionOffer()}
        />
      ) : null}

      <div className="csw-side">
        {showSourceSelector ? (
          <SourceSelector
            items={state.items}
            currentIndex={state.currentIndex}
            onSelect={(index) => void actions.playIndex(index)}
          />
        ) : null}
        <SubtitleSelector
          tracks={state.subtitles}
          activeId={state.activeSubtitleId}
          onSelect={(id) => void actions.setSubtitle(id)}
          onAddFiles={(files) => void actions.addSubtitleFiles(files)}
        />
        <PlaylistPanel
          items={state.items}
          currentIndex={state.currentIndex}
          onSelect={(index) => void actions.playIndex(index)}
          onRemove={actions.removeItem}
          onClear={actions.clearPlaylist}
        />
        {showLocalPicker ? (
          <section className="csw-panel" aria-label="Add local media">
            <LocalFilePicker onFiles={(files) => void actions.addLocalFiles(files)} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
