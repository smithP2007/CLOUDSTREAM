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
import { dedupeLinks, dedupeSubtitles, sortLinksByQualityDesc } from '../core/links';
import { PlaybackError, toPlaybackError } from './errors';
import { capabilitiesFromMediaElement, type Container } from './formatSupport';
import { ensureVtt } from './srtToVtt';
import { decideLinkPlayback, decideLocalPlayback, type ConversionAvailability, type DecisionAction } from './playbackDecision';
import { inspectLocalFile, localFileToSource, readSubtitleAsVtt } from './localMedia';
import { createObjectUrlRegistry } from './objectUrls';
import { buildDefaultEngineRegistry } from './engines/registry';
import type {
  ConversionOfferView,
  EngineSession,
  ObjectUrlRegistry,
  PlaybackControllerOptions,
  PlaybackEngine,
  PlaybackState,
  PlaybackStatus,
  PlayerSource,
  PlaylistItemView,
  SubtitleTrackInput,
  SubtitleTrackView,
} from './types';

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

interface InternalItem {
  source: PlayerSource;
  /** Original local file — kept ONLY for the optional conversion action. */
  file: File | null;
  containerLabel: string;
  note: string | null;
  engineId: PlaybackState['engineId'];
  decision: DecisionAction | null;
}

interface InternalSubtitle {
  input: SubtitleTrackInput;
  /** Local (blob:) URL of WebVTT text once prepared; null until needed. */
  vttUrl: string | null;
}

const MEDIA_ERROR_CODES: Readonly<Record<number, PlaybackError['code']>> = {
  1: 'aborted', // MEDIA_ERR_ABORTED
  2: 'network-error', // MEDIA_ERR_NETWORK
  3: 'decoding-error', // MEDIA_ERR_DECODE
  4: 'unsupported-format', // MEDIA_ERR_SRC_NOT_SUPPORTED
};

function defaultConversionAvailability(): ConversionAvailability {
  const hasWorker = typeof Worker !== 'undefined';
  const hasWasm = typeof WebAssembly !== 'undefined';
  if (hasWorker && hasWasm) return { available: true, maxInputBytes: 1_610_612_736 };
  return {
    available: false,
    maxInputBytes: 1_610_612_736,
    unavailableReason: !hasWorker ? 'Web Workers are unavailable.' : 'WebAssembly is unavailable.',
  };
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                  */
/* -------------------------------------------------------------------------- */

export class PlaybackController {
  private readonly engines;
  private readonly urls: ObjectUrlRegistry;
  private readonly maxSourceAttempts: number;
  private readonly autoplay: boolean;
  private readonly conversion: ConversionAvailability;

  private media: HTMLMediaElement | null = null;
  private session: EngineSession | null = null;
  private mediaListeners: Array<[string, EventListener]> = [];

  private localItems: InternalItem[] = [];
  private providerItems: InternalItem[] = [];
  private currentIndex = -1;
  private currentAttempts = 0;

  private subs: InternalSubtitle[] = [];
  private activeSubtitleId: string | null = null;
  private activeTrackEl: HTMLTrackElement | null = null;

  private status: PlaybackStatus = 'idle';
  private error: PlaybackState['error'] = null;
  private notice: string | null = null;
  private lastDecision: string | null = null;
  private conversionOffer: ConversionOfferView | null = null;

  private currentTimeSec = 0;
  private durationSec = 0;
  private bufferedSec = 0;

  private readonly volume = { value: 1, muted: false, rate: 1 };

  private listeners = new Set<() => void>();
  private snapshot: PlaybackState | null = null;
  private loadToken = 0;
  private disposed = false;

  /** True after dispose() — used by the React hook to swap in a fresh instance. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  constructor(options: PlaybackControllerOptions = {}) {
    this.engines = options.engines ?? buildDefaultEngineRegistry();
    this.urls = options.objectUrls ?? createObjectUrlRegistry();
    this.maxSourceAttempts = Math.max(1, options.maxSourceAttempts ?? 3);
    this.autoplay = options.autoplay ?? true;
    this.conversion = options.conversion ?? defaultConversionAvailability();
  }

  /* ----------------------- external store surface ----------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): PlaybackState => {
    if (!this.snapshot) this.snapshot = this.buildSnapshot();
    return this.snapshot;
  };

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): PlaybackState {
    const items = [...this.localItems, ...this.providerItems];
    const view: PlaylistItemView[] = items.map((item) => ({
      id: item.source.id,
      label: item.source.label,
      kind: item.source.kind,
      sizeBytes: item.source.sizeBytes ?? null,
      engineId: item.engineId,
      note: item.note,
      badge: item.containerLabel,
    }));
    const subtitles: SubtitleTrackView[] = this.subs.map((sub) => ({
      id: sub.input.id,
      label: sub.input.label,
      language: sub.input.language,
      origin: sub.input.origin,
      ready: sub.vttUrl != null,
    }));
    return {
      status: this.status,
      currentIndex: this.currentIndex,
      items: view,
      currentTimeSec: this.currentTimeSec,
      durationSec: this.durationSec,
      bufferedSec: this.bufferedSec,
      volume: this.volume.value,
      muted: this.volume.muted,
      rate: this.volume.rate,
      engineId: this.session?.engineId ?? null,
      error: this.error,
      notice: this.notice,
      lastDecision: this.lastDecision,
      subtitles,
      activeSubtitleId: this.activeSubtitleId,
      conversionOffer: this.conversionOffer,
    };
  }

  private items(): InternalItem[] {
    return [...this.localItems, ...this.providerItems];
  }

  /* ------------------------- media element ------------------------------ */

  /** Idempotent. Passing null detaches. Re-attach resumes the current item. */
  attachElement(el: HTMLMediaElement | null): void {
    if (this.disposed) return;
    if (this.media === el) return;
    this.removeMediaListeners();
    this.media = el;
    if (!el) return;
    this.installMediaListeners(el);
    el.volume = this.volume.value;
    el.muted = this.volume.muted;
    el.playbackRate = this.volume.rate;
    // Resume wiring for a selected item if the element arrived late (React mount order).
    if (this.currentIndex >= 0 && this.session == null && !this.disposed) {
      const token = ++this.loadToken;
      void this.attemptIndex(this.currentIndex, token, false);
    }
  }

  private installMediaListeners(el: HTMLMediaElement): void {
    const on = (type: string, fn: EventListener): void => {
      el.addEventListener(type, fn);
      this.mediaListeners.push([type, fn]);
    };
    on('timeupdate', () => {
      this.currentTimeSec = el.currentTime;
      this.emit();
    });
    on('durationchange', () => {
      this.durationSec = Number.isFinite(el.duration) ? el.duration : 0;
      this.emit();
    });
    on('progress', () => {
      try {
        const ranges = el.buffered;
        this.bufferedSec = ranges.length > 0 ? ranges.end(ranges.length - 1) : 0;
      } catch {
        this.bufferedSec = 0;
      }
      this.emit();
    });
    on('play', () => this.setStatus('playing'));
    on('playing', () => this.setStatus('playing'));
    on('pause', () => {
      if (!el.ended) this.setStatus('paused');
    });
    on('waiting', () => this.setStatus('buffering'));
    on('canplay', () => {
      if (this.status === 'loading' || this.status === 'buffering') this.setStatus('ready');
    });
    on('ended', () => {
      this.setStatus('ended');
      const next = this.currentIndex + 1;
      if (next < this.items().length) void this.playIndex(next, false);
    });
    on('error', () => {
      const code = el.error?.code ?? 0;
      const mapped = MEDIA_ERROR_CODES[code] ?? 'unknown';
      void this.handleFatal(new PlaybackError(mapped), this.loadToken, true);
    });
    on('volumechange', () => {
      this.volume.value = el.volume;
      this.volume.muted = el.muted;
      this.emit();
    });
    on('ratechange', () => {
      this.volume.rate = el.playbackRate;
      this.emit();
    });
  }

  private removeMediaListeners(): void {
    for (const [type, fn] of this.mediaListeners) this.media?.removeEventListener(type, fn);
    this.mediaListeners = [];
  }

  private setStatus(status: PlaybackStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  /** Aligns the state machine with the element's actual playback state. */
  private syncStatusFromElement(): void {
    const el = this.media;
    if (!el) return;
    if (!el.paused && !el.ended) this.status = 'playing';
    else if (this.status === 'loading' && el.readyState >= 3) this.status = 'paused';
    this.emit();
  }

  /* --------------------------- playlist --------------------------------- */

  /** Adds provider links (sorted quality-desc, deduped via the CORE helpers). */
  setProviderLinks(links: readonly PlaybackLink[]): void {
    if (this.disposed) return;
    const currentId = this.items()[this.currentIndex]?.source.id ?? null;
    this.providerItems = dedupeLinks(sortLinksByQualityDesc([...links])).map((link, i) => ({
      source: {
        id: `link-${i}-${link.url}`,
        kind: link.type === 'hls' ? 'hls' : link.type === 'dash' ? 'dash' : 'progressive',
        url: link.url,
        label: link.quality != null ? `${link.name} · ${link.quality}p` : link.name,
        mimeHint: null,
        localFile: null,
        link,
        sizeBytes: null,
        inspection: null,
      },
      file: null,
      containerLabel: link.type.toUpperCase(),
      note: null,
      engineId: null,
      decision: null,
    }));
    this.restoreCurrentIndex(currentId);
    this.emit();
  }

  /** Adds provider subtitles (deduped per (language, url) by the CORE helpers). */
  setProviderSubtitles(subtitles: readonly SubtitleFile[]): void {
    if (this.disposed) return;
    this.subs = this.subs.filter((sub) => sub.input.origin !== 'provider');
    for (const sub of dedupeSubtitles(subtitles)) {
      this.subs.push({
        input: {
          id: `provider-sub-${sub.language}-${sub.url}`,
          label: sub.filename ? `${sub.language} (${sub.filename})` : sub.language,
          language: sub.language,
          url: sub.url,
          filename: sub.filename ?? null,
          origin: 'provider',
        },
        vttUrl: null,
      });
    }
    this.emit();
  }

  /** Inspects + appends local files (bounded 4 KiB head read per file). */
  async addLocalFiles(files: readonly File[]): Promise<void> {
    if (this.disposed || files.length === 0) return;
    const firstAdded = this.localItems.length;
    for (const file of files) {
      let inspection = null;
      try {
        inspection = await inspectLocalFile(file);
      } catch {
        inspection = { container: 'unknown', mime: '', sizeBytes: file.size, fileName: file.name };
      }
      const source = localFileToSource(file, inspection, this.urls, `local-${this.localItems.length}-${file.name}`);
      this.localItems.push({
        source,
        file,
        containerLabel: inspection.container === 'unknown' ? 'FILE' : inspection.container.toUpperCase(),
        note: null,
        engineId: null,
        decision: null,
      });
    }
    this.emit();
    if (this.currentIndex < 0) await this.playIndex(firstAdded, false);
  }

  /** Adds a converted blob (client-side conversion output) to the playlist. */
  async addLocalBlob(blob: Blob, name: string, convertedFrom?: string): Promise<void> {
    const knownIds = new Set(this.items().map((item) => item.source.id));
    const file = new File([blob], name, { type: blob.type });
    await this.addLocalFiles([file]);
    const added = this.localItems.find((item) => !knownIds.has(item.source.id));
    if (!added) return;
    // "Convert and play" is an explicit user action: play the output even
    // when the playlist already has a current item (e.g. the conversion
    // input). addLocalFiles only auto-plays into an EMPTY playlist.
    const combinedIndex = this.items().indexOf(added);
    if (combinedIndex !== this.currentIndex) await this.playIndex(combinedIndex, false);
    if (convertedFrom) {
      // Set AFTER playIndex: attemptIndex rewrites `note` with the current
      // playback decision (native path clears it); provenance must survive.
      added.note = `converted output (${convertedFrom})`;
      this.emit();
    }
  }

  /** The original local file behind an item (conversion input). */
  getLocalFile(itemId: string): File | null {
    return this.items().find((item) => item.source.id === itemId)?.file ?? null;
  }

  /** Dismisses the current conversion offer (user chose not to convert). */
  clearConversionOffer(): void {
    this.conversionOffer = null;
    this.emit();
  }

  removeItem(itemId: string): void {
    if (this.disposed) return;
    const items = this.items();
    const index = items.findIndex((item) => item.source.id === itemId);
    if (index < 0) return;
    const item = items[index] as InternalItem;
    const wasCurrent = index === this.currentIndex;
    if (item.source.url.startsWith('blob:')) this.urls.revoke(item.source.url);
    if (index < this.localItems.length) this.localItems.splice(index, 1);
    else this.providerItems.splice(index - this.localItems.length, 1);
    if (wasCurrent) {
      this.stopSession();
      this.currentIndex = -1;
      this.status = 'idle';
      this.error = null;
      this.conversionOffer = null;
      this.removeActiveTrack();
    } else if (index < this.currentIndex) {
      this.currentIndex -= 1;
    }
    this.emit();
  }

  clearPlaylist(): void {
    if (this.disposed) return;
    this.stopSession();
    this.removeActiveTrack();
    for (const item of this.items()) {
      if (item.source.url.startsWith('blob:')) this.urls.revoke(item.source.url);
    }
    this.localItems = [];
    this.providerItems = [];
    this.currentIndex = -1;
    this.status = 'idle';
    this.error = null;
    this.notice = null;
    this.lastDecision = null;
    this.conversionOffer = null;
    this.emit();
  }

  private restoreCurrentIndex(previousId: string | null): void {
    const items = this.items();
    if (previousId) {
      const index = items.findIndex((item) => item.source.id === previousId);
      this.currentIndex = index;
      return;
    }
    if (this.currentIndex >= items.length) this.currentIndex = items.length - 1;
  }

  /* ---------------------------- playback -------------------------------- */

  /** Explicit selection: the chosen item's failure is shown honestly (no auto-skip). */
  async playIndex(index: number, _allowFallback = false): Promise<void> {
    if (this.disposed) return;
    const items = this.items();
    if (index < 0 || index >= items.length) return;
    this.currentAttempts = this.maxSourceAttempts;
    const token = ++this.loadToken;
    await this.attemptIndex(index, token, false);
  }

  async next(): Promise<void> {
    if (this.items().length === 0) return;
    const next = (this.currentIndex + 1) % this.items().length;
    await this.playIndex(next, false);
  }

  async previous(): Promise<void> {
    if (this.items().length === 0) return;
    const count = this.items().length;
    const prev = (this.currentIndex - 1 + count) % count;
    await this.playIndex(prev, false);
  }

  private async attemptIndex(index: number, token: number, allowFallback: boolean): Promise<void> {
    const item = this.items()[index];
    if (!item) return;
    this.stopSession();
    this.removeActiveTrack();
    this.currentIndex = index;
    this.error = null;
    this.notice = null;
    this.lastDecision = null;
    this.conversionOffer = null;
    this.currentTimeSec = 0;
    this.durationSec = 0;
    this.bufferedSec = 0;
    this.status = 'loading';
    this.emit();

    if (!this.media) {
      // Element arrives later (React mount order): attachElement() resumes.
      this.status = 'ready';
      this.emit();
      return;
    }

    let decision: DecisionAction;
    if (item.source.kind === 'local-file') {
      const inspection = item.source.inspection;
      decision = inspection
        ? decideLocalPlayback(
            {
              container: inspection.container as Container,
              sizeBytes: inspection.sizeBytes,
              fileName: inspection.fileName,
            },
            { caps: capabilitiesFromMediaElement(this.media), conversion: this.conversion },
          )
        : { action: 'native', reason: 'Native playback attempt (container unknown).' };
    } else if (item.source.link) {
      decision = decideLinkPlayback(item.source.link, {
        caps: capabilitiesFromMediaElement(this.media),
        conversion: this.conversion,
      });
    } else {
      decision = { action: 'native', reason: 'Native playback attempt.' };
    }

    item.decision = decision;
    if (token !== this.loadToken) return;

    switch (decision.action) {
      case 'native':
      case 'engine': {
        const engineId = decision.action === 'native' ? 'native' : decision.engine;
        item.engineId = engineId;
        item.note = null;
        let engine: PlaybackEngine | undefined;
        try {
          engine = await this.engines.get(engineId);
        } catch (error) {
          if (token !== this.loadToken) return;
          await this.handleFatal(toPlaybackError(error, 'engine-missing'), token, allowFallback);
          return;
        }
        if (!engine) {
          await this.handleFatal(
            new PlaybackError('engine-missing', `No engine registered for "${engineId}".`),
            token,
            allowFallback,
          );
          return;
        }
        if (token !== this.loadToken) return;
        this.lastDecision = decision.reason;
        this.emit();
        try {
          const session = await engine.attach(this.media, item.source, {
            autoplay: this.autoplay,
            onFatal: (fatal) => void this.handleFatal(fatal, token, true),
            onNotice: (message) => this.setNotice(message),
          });
          if (token !== this.loadToken) {
            session.destroy();
            return;
          }
          this.session = session;
          // The element may already be playing (e.g. this controller attached
          // after autoplay began): sync the state machine with reality.
          this.syncStatusFromElement();
          this.emit();
        } catch (error) {
          if (token !== this.loadToken) return;
          await this.handleFatal(toPlaybackError(error, 'unknown'), token, allowFallback);
        }
        return;
      }
      case 'relay-required':
        item.engineId = null;
        item.note = 'needs relay (headers required)';
        this.failCurrent('relay-required', decision.reason, item.source.id, allowFallback);
        return;
      case 'unplayable':
        item.engineId = null;
        item.note = 'unplayable here';
        this.failCurrent(decision.code, decision.reason, item.source.id, allowFallback);
        return;
      case 'offer-conversion':
        item.engineId = null;
        item.note = `needs conversion -> ${decision.profile.label}`;
        this.status = 'ready';
        this.lastDecision = decision.reason;
        this.conversionOffer = {
          itemId: item.source.id,
          profileLabel: decision.profile.label,
          reason: decision.reason,
          profile: decision.profile,
        };
        this.emit();
        return;
    }
  }

  /** Shows the error for the current item; fallback only via handleFatal chains. */
  private failCurrent(
    code: PlaybackError['code'],
    reason: string,
    sourceId: string,
    _allowFallback: boolean,
  ): void {
    this.status = 'error';
    this.error = { code, message: reason, sourceId };
    this.emit();
  }

  /** Engine-fatal path: bounded fallback to the next attemptable source. */
  private async handleFatal(error: PlaybackError, token: number, allowFallback: boolean): Promise<void> {
    if (token !== this.loadToken || this.disposed) return;
    this.stopSession();
    this.currentAttempts -= 1;
    const current = this.items()[this.currentIndex];
    const next = allowFallback ? this.nextAttemptableIndex(this.currentIndex + 1) : -1;
    if (!allowFallback || this.currentAttempts <= 0 || next < 0) {
      this.status = 'error';
      this.error = { code: error.code, message: error.message, sourceId: current?.source.id ?? null };
      this.emit();
      return;
    }
    this.notice = `Skipped "${current?.source.label ?? 'source'}" after an error; trying the next compatible source.`;
    // Invalidate the aborted attach chain: its late-resolving session is
    // destroyed by the token guard (no leaked engines, no clobbered state).
    const fallbackToken = ++this.loadToken;
    await this.attemptIndex(next, fallbackToken, allowFallback);
    // attemptIndex() clears stale notices; re-state the fallback explanation
    // afterwards so the user always sees why the source changed.
    this.notice = `Skipped "${current?.source.label ?? 'source'}" after an error; trying the next compatible source.`;
    this.emit();
  }

  /** Forward scan for the next source whose decision is attemptable. */
  private nextAttemptableIndex(from: number): number {
    const items = this.items();
    const caps = this.media ? capabilitiesFromMediaElement(this.media) : null;
    for (let i = from; i < items.length; i++) {
      const item = items[i];
      if (!item || !caps) continue;
      const decision =
        item.source.kind === 'local-file'
          ? decideLocalPlayback(
              {
                container: (item.source.inspection?.container ?? 'unknown') as Container,
                sizeBytes: item.source.inspection?.sizeBytes ?? item.source.sizeBytes ?? 0,
                fileName: item.source.inspection?.fileName ?? item.source.label,
              },
              { caps, conversion: this.conversion },
            )
          : item.source.link
            ? decideLinkPlayback(item.source.link, { caps, conversion: this.conversion })
            : ({ action: 'native', reason: '' } as DecisionAction);
      if (decision.action === 'native' || decision.action === 'engine') return i;
    }
    return -1;
  }

  private stopSession(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        /* engine destroy must never break the controller */
      }
      this.session = null;
    }
  }

  /* ---------------------------- transport ------------------------------- */

  play(): void {
    if (!this.media) return;
    this.media.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.setNotice('Autoplay was blocked by the browser; press play to start.');
        return;
      }
      void this.handleFatal(toPlaybackError(error, 'unknown'), this.loadToken, true);
    });
  }

  pause(): void {
    this.media?.pause();
  }

  togglePlay(): void {
    if (!this.media) return;
    if (this.media.paused) this.play();
    else this.pause();
  }

  seek(seconds: number): void {
    if (!this.media) return;
    const max = Number.isFinite(this.media.duration) ? this.media.duration : Number.MAX_SAFE_INTEGER;
    this.media.currentTime = Math.min(Math.max(seconds, 0), max);
  }

  seekBy(delta: number): void {
    if (!this.media) return;
    this.seek(this.media.currentTime + delta);
  }

  setVolume(volume: number): void {
    if (!this.media) return;
    this.media.volume = Math.min(Math.max(volume, 0), 1);
  }

  toggleMute(): void {
    if (!this.media) return;
    this.media.muted = !this.media.muted;
  }

  setRate(rate: number): void {
    if (!this.media) return;
    this.media.playbackRate = Math.min(Math.max(rate, 0.25), 4);
  }

  private setNotice(message: string): void {
    this.notice = message;
    this.emit();
  }

  /* ---------------------------- subtitles ------------------------------- */

  /** Adds local subtitle files (SRT converted to VTT; content decides format). */
  async addSubtitleFiles(files: readonly File[]): Promise<void> {
    if (this.disposed) return;
    for (const file of files) {
      try {
        const { vtt } = await readSubtitleAsVtt(file, file.name);
        const url = this.urls.create(new Blob([vtt], { type: 'text/vtt' }));
        this.subs.push({
          input: {
            id: `local-sub-${file.name}-${this.subs.length}`,
            label: file.name,
            language: 'local',
            url: null,
            localFile: file,
            filename: file.name,
            origin: 'local',
          },
          vttUrl: url,
        });
      } catch (error) {
        this.setNotice(toPlaybackError(error, 'unsupported-format').message);
      }
    }
    this.emit();
  }

  /** Selects a subtitle track (or null = off). Provider tracks fetch once. */
  async setSubtitle(id: string | null): Promise<void> {
    if (this.disposed) return;
    if (id == null) {
      this.activeSubtitleId = null;
      this.removeActiveTrack();
      this.emit();
      return;
    }
    const sub = this.subs.find((candidate) => candidate.input.id === id);
    if (!sub) return;
    if (sub.vttUrl == null && sub.input.url) {
      // Provider track: fetch text once (CORS-checked), convert SRT if needed,
      // then serve locally so the <track> never needs cross-origin media mode.
      try {
        const response = await fetch(sub.input.url);
        if (!response.ok) throw new PlaybackError('network-error', `Subtitle fetch failed (HTTP ${response.status}).`);
        const text = await response.text();
        sub.vttUrl = this.urls.create(new Blob([ensureVtt(text, sub.input.label)], { type: 'text/vtt' }));
      } catch (error) {
        this.setNotice(`Subtitle "${sub.input.label}" could not be loaded: ${toPlaybackError(error, 'network-error').message}`);
        this.emit();
        return;
      }
    }
    this.activeSubtitleId = id;
    this.renderActiveTrack();
    this.emit();
  }

  private renderActiveTrack(): void {
    const media = this.media;
    if (!media) return;
    this.removeActiveTrack();
    const sub = this.subs.find((candidate) => candidate.input.id === this.activeSubtitleId);
    if (!sub?.vttUrl) return;
    // Track elements are created through the media element's own document so
    // the headless controller never depends on a global DOM.
    const doc = (media as HTMLMediaElement & { ownerDocument?: Document }).ownerDocument;
    if (!doc) return;
    const track = doc.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.input.label;
    track.srclang = sub.input.language;
    track.src = sub.vttUrl;
    track.default = true;
    media.appendChild(track);
    this.activeTrackEl = track;
    // jsdom/older browsers lack TextTrack wiring; mode setting is best-effort.
    try {
      const textTrack = media.textTracks?.[0];
      if (textTrack) textTrack.mode = 'showing';
    } catch {
      /* rendering of cues is verified manually in real browsers */
    }
  }

  private removeActiveTrack(): void {
    const media = this.media;
    const track = this.activeTrackEl;
    if (media && track && track.parentNode === media) {
      media.removeChild(track);
    }
    this.activeTrackEl = null;
  }

  /* ----------------------------- disposal ------------------------------- */

  /** Idempotent: destroys the engine session, listeners, and every object URL. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadToken++; // in-flight attaches become no-ops
    this.stopSession();
    this.removeMediaListeners();
    this.removeActiveTrack();
    this.urls.revokeAll();
    this.localItems = [];
    this.providerItems = [];
    this.subs = [];
    this.listeners.clear();
    this.media = null;
    this.status = 'idle';
  }
}
