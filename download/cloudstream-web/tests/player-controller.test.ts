/**
 * Headless PlaybackController tests (pure Node, injected fakes — no DOM, no
 * network): playlist lifecycle, decision-gated playback, bounded fallback,
 * object-URL revocation, subtitle handling, and disposal.
 */

import { describe, expect, it, vi } from 'vitest';
import { PlaybackController } from '../src/player/PlaybackController';
import { conversionAvailability } from '../src/player/playbackDecision';
import { createEngineRegistry } from '../src/player/engines/registry';
import type { EngineRegistry, ObjectUrlRegistry, PlaybackEngine, PlaybackState } from '../src/player/types';
import type { PlaybackLink, SubtitleFile } from '../src/core/types';
import { PlaybackError } from '../src/player/errors';

/* -------------------------------------------------------------------------- */
/* Fakes                                                                       */
/* -------------------------------------------------------------------------- */

const MP4_HEAD = new Uint8Array(32);
MP4_HEAD.set([0, 0, 0, 0], 0);
'ftypisom'.split('').forEach((ch, i) => (MP4_HEAD[i + 4] = ch.charCodeAt(0)));

const AVI_HEAD = (() => {
  const head = new Uint8Array(32);
  'RIFF'.split('').forEach((ch, i) => (head[i] = ch.charCodeAt(0)));
  'AVI '.split('').forEach((ch, i) => (head[i + 8] = ch.charCodeAt(0)));
  return head;
})();

function makeFile(name: string, head: Uint8Array, size = 1000): File {
  const file = new File([head.buffer as ArrayBuffer], name, { type: '' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

interface FakeMedia {
  el: HTMLMediaElement;
  listeners: Map<string, Array<(event?: unknown) => void>>;
  tracks: Array<Record<string, unknown>>;
  appended: unknown[];
  removed: unknown[];
  playCalls: number;
  emit(type: string): void;
}

function makeMediaElement(canPlayTable: Record<string, string> = { 'video/mp4': 'probably' }): FakeMedia {
  const listeners = new Map<string, Array<(event?: unknown) => void>>();
  const tracks: Array<Record<string, unknown>> = [];
  const appended: unknown[] = [];
  const removed: unknown[] = [];
  let playCalls = 0;
  const el = {
    src: '',
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    ended: false,
    readyState: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    error: null,
    buffered: { length: 0, end: () => 0 },
    textTracks: tracks,
    crossOrigin: null,
    addEventListener(type: string, fn: (event?: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: (event?: unknown) => void) {
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    appendChild(node: unknown) {
      (node as { parentNode?: unknown }).parentNode = el;
      appended.push(node);
      tracks.push(node as Record<string, unknown>);
      return node;
    },
    removeChild(node: unknown) {
      removed.push(node);
      (node as { parentNode?: unknown }).parentNode = null;
      const index = tracks.indexOf(node as Record<string, unknown>);
      if (index >= 0) tracks.splice(index, 1);
      return node;
    },
    ownerDocument: {
      createElement(tag: string) {
        return { tagName: tag, parentNode: null, kind: '', label: '', srclang: '', src: '', default: false };
      },
    },
    removeAttribute() {
      el.src = '';
    },
    load() {},
    canPlayType(mime: string) {
      return canPlayTable[mime] ?? '';
    },
    play() {
      playCalls += 1;
      return Promise.resolve();
    },
    pause() {},
  };
  const fake: FakeMedia = {
    el: el as unknown as HTMLMediaElement,
    listeners,
    tracks,
    appended,
    removed,
    get playCalls() {
      return playCalls;
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
  return fake;
}

function makeRecordingEngine(id: 'native' | 'hls' | 'dash'): {
  engine: PlaybackEngine;
  readonly attaches: Array<{ url: string }>;
  readonly destroys: number;
  setFatalOnAttachOnce(error: PlaybackError): void;
} {
  const state: { attaches: Array<{ url: string }>; destroys: number; fatal: PlaybackError | null } = {
    attaches: [],
    destroys: 0,
    fatal: null,
  };
  const engine: PlaybackEngine = {
    id,
    canPlay: () => ({ supported: true, reason: 'fake' }),
    async attach(media, source, options) {
      state.attaches.push({ url: source.url });
      if (state.fatal) {
        const failure = state.fatal;
        state.fatal = null;
        // Real engines report fatal conditions through the session options
        // while attached; simulate one tick of async playback first.
        await new Promise((resolve) => setTimeout(resolve, 0));
        options.onFatal(failure);
      }
      void media;
      return {
        engineId: id,
        destroy() {
          state.destroys += 1;
        },
      };
    },
  };
  return {
    engine,
    attaches: state.attaches,
    get destroys(): number {
      return state.destroys;
    },
    setFatalOnAttachOnce(error: PlaybackError): void {
      state.fatal = error;
    },
  };
}

function makeRegistry(...engines: PlaybackEngine[]): EngineRegistry {
  const registry = createEngineRegistry();
  for (const engine of engines) registry.register(engine.id, async () => engine);
  return registry;
}

/** An engine whose every attach reports a fatal error through onFatal. */
function makeAlwaysFailingEngine(id: 'native'): PlaybackEngine {
  return {
    id,
    canPlay: () => ({ supported: true, reason: 'fake' }),
    async attach(_media, _source, options) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      options.onFatal(new PlaybackError('network-error'));
      return { engineId: id, destroy() {} };
    },
  };
}

function makeUrls(): { create: (blob: Blob) => string; revoke: (url: string) => void; revokeAll: () => void; size: number; revoked: string[]; issued: string[] } {
  const revoked: string[] = [];
  const issued: string[] = [];
  let counter = 0;
  return {
    create() {
      const url = `blob:fake-${counter++}`;
      issued.push(url);
      return url;
    },
    revoke(url) {
      revoked.push(url);
    },
    revokeAll() {
      for (const url of issued) revoked.push(url);
    },
    get size() {
      return issued.length;
    },
    revoked,
    issued,
  };
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function controllerWith(media: FakeMedia, engines: EngineRegistry, urls: ReturnType<typeof makeUrls>): PlaybackController {
  const controller = new PlaybackController({
    engines,
    objectUrls: urls as unknown as ObjectUrlRegistry,
    autoplay: false,
    // Node has no global Worker; make the decision paths conversion-capable.
    conversion: conversionAvailability(true, 1_000_000_000),
  });
  controller.attachElement(media.el);
  return controller;
}

/* -------------------------------------------------------------------------- */
/* Playlist + decision-gated playback                                          */
/* -------------------------------------------------------------------------- */

describe('local files and decision-gated playback', () => {
  it('sniffs the container, creates exactly one object URL, and auto-plays the first file', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);

    await controller.addLocalFiles([makeFile('sample.mp4', MP4_HEAD)]);
    await flush();

    const state = controller.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ badge: 'MP4', kind: 'local-file', sizeBytes: 1000 });
    expect(urls.issued).toHaveLength(1);
    expect(engineStub.attaches).toEqual([{ url: 'blob:fake-0' }]);
    expect(state.lastDecision).toContain('Native playback');
  });

  it('offers conversion for an unsupported local container (AVI) instead of attempting playback', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());

    await controller.addLocalFiles([makeFile('clip.avi', AVI_HEAD)]);
    await flush();

    const state = controller.getState();
    expect(state.items[0]?.badge).toBe('AVI');
    expect(engineStub.attaches).toHaveLength(0);
    expect(state.conversionOffer).toMatchObject({ itemId: state.items[0]?.id, profileLabel: 'MP4 (H.264 + AAC)' });
    expect(state.status).toBe('ready');
    expect(state.items[0]?.note).toContain('needs conversion');
  });

  it('reports relay-required honestly for header-gated provider links', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    const link: PlaybackLink = {
      source: 'x',
      name: 'Gated',
      url: 'https://cdn.example/v.m3u8',
      type: 'hls',
      quality: 720,
      headers: { Authorization: 'Bearer x' },
    };
    controller.setProviderLinks([link]);
    await controller.playIndex(0);
    await flush();

    const state = controller.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({ code: 'relay-required' });
    expect(state.items[0]?.note).toContain('needs relay');
    expect(engineStub.attaches).toHaveLength(0);
  });

  it('marks unsupported remote containers unplayable without fetching anything', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    controller.setProviderLinks([
      { source: 'x', name: 'Old film', url: 'https://cdn.example/movie.avi', type: 'video', quality: null },
    ]);
    await controller.playIndex(0);
    await flush();
    expect(controller.getState().error).toMatchObject({ code: 'unsupported-format' });
    expect(engineStub.attaches).toHaveLength(0);
  });

  it('survives files that cannot be inspected (graceful unknown container)', async () => {
    const media = makeMediaElement({ 'video/mp4': 'probably' });
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    const garbage = makeFile('mystery.bin', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    await controller.addLocalFiles([garbage]);
    await flush();
    const state = controller.getState();
    expect(state.items[0]?.badge).toBe('FILE');
    // Unknown container: the decision attempts native playback (browser validates).
    expect(state.items[0]?.engineId).toBe('native');
    expect(engineStub.attaches).toHaveLength(1);
  });
});

describe('provider links: quality sort, dedupe, bounded fallback', () => {
  it('sorts links quality-descending with unknown last and dedupes by URL (core semantics)', () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    const links: PlaybackLink[] = [
      { source: 'a', name: 'A', url: 'https://x/1', type: 'video', quality: 480 },
      { source: 'b', name: 'B-high', url: 'https://x/2', type: 'video', quality: 1080 },
      { source: 'c', name: 'C-dup-of-A', url: 'https://x/1', type: 'video', quality: 480 },
      { source: 'd', name: 'D-unknown', url: 'https://x/4', type: 'video', quality: null },
    ];
    controller.setProviderLinks(links);
    const labels = controller.getState().items.map((item) => item.label);
    expect(labels).toEqual(['B-high · 1080p', 'A · 480p', 'D-unknown']);
  });

  it('falls back to the next compatible source after an engine-fatal error (bounded)', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    controller.setProviderLinks([
      { source: 'a', name: 'Bad', url: 'https://x/1', type: 'video', quality: 1080 },
      { source: 'b', name: 'Good', url: 'https://x/2', type: 'video', quality: 720 },
    ]);
    await controller.playIndex(0);
    await flush();
    expect(engineStub.attaches).toHaveLength(1);

    // The engine reports a fatal condition through onFatal (as real engines do).
    engineStub.setFatalOnAttachOnce(new PlaybackError('network-error'));
    // Re-trigger playback of the bad source; onFatal fires mid-attach and the
    // controller must fall forward to source 2 without replaying source 1.
    await controller.playIndex(0);
    await flush();

    const state = controller.getState();
    expect(state.notice).toContain('Skipped');
    expect(state.items[0]?.note).toBe(null);
    expect(state.status).not.toBe('error');
    // History: initial play attached x/1, the explicit replay attached x/1
    // again, the fatal error fell forward to x/2 (never a third retry of x/1).
    expect(engineStub.attaches.map((a) => a.url)).toEqual(['https://x/1', 'https://x/1', 'https://x/2']);
  });

  it('stops with a typed error when every attempt is exhausted', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeAlwaysFailingEngine('native')), makeUrls());
    controller.setProviderLinks([
      { source: 'a', name: 'A', url: 'https://x/1', type: 'video', quality: 720 },
      { source: 'b', name: 'B', url: 'https://x/2', type: 'video', quality: 480 },
    ]);
    await controller.playIndex(0);
    await flush();
    const state = controller.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({ code: 'network-error' });
  });

  it('advances automatically when an item ends (playlist semantics)', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    controller.setProviderLinks([
      { source: 'a', name: 'A', url: 'https://x/1', type: 'video', quality: 720 },
      { source: 'b', name: 'B', url: 'https://x/2', type: 'video', quality: 480 },
    ]);
    await controller.playIndex(0);
    await flush();
    media.emit('ended');
    await flush();
    expect(engineStub.attaches).toHaveLength(2);
  });

  it('wraps around with next/previous', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    controller.setProviderLinks([
      { source: 'a', name: 'A', url: 'https://x/1', type: 'video', quality: 720 },
      { source: 'b', name: 'B', url: 'https://x/2', type: 'video', quality: 480 },
    ]);
    await controller.next();
    await flush();
    expect(controller.getState().currentIndex).toBe(0); // from -1 -> 0
    await controller.previous();
    await flush();
    expect(controller.getState().currentIndex).toBe(1); // wraps to the last item
  });
});

describe('media element state machine', () => {
  it('follows element events: canplay -> ready, playing -> playing, pause -> paused', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();

    media.emit('canplay');
    expect(controller.getState().status).toBe('ready');
    media.emit('play');
    expect(controller.getState().status).toBe('playing');
    media.emit('pause');
    expect(controller.getState().status).toBe('paused');
    media.emit('waiting');
    expect(controller.getState().status).toBe('buffering');
    media.emit('durationchange');
    expect(controller.getState().durationSec).toBe(0); // NaN duration guarded
  });

  it('maps media element error codes to typed errors', async () => {
    const media = makeMediaElement();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), makeUrls());
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();
    (media.el as unknown as { error: { code: number } | null }).error = { code: 4 };
    media.emit('error');
    await flush();
    expect(controller.getState().error).toMatchObject({ code: 'unsupported-format' });
  });

  it('replays the current item when the element attaches late', async () => {
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = new PlaybackController({ engines: makeRegistry(engineStub.engine), objectUrls: urls as never, autoplay: false });
    const media = makeMediaElement();
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();
    expect(controller.getState().status).toBe('ready'); // waiting for the element
    controller.attachElement(media.el);
    await flush();
    expect(engineStub.attaches).toHaveLength(1);
  });
});

describe('resource lifecycle', () => {
  it('destroys the previous session and revokes the URL when an item is removed', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();
    const state = controller.getState();
    const itemId = state.items[0]?.id as string;

    controller.removeItem(itemId);
    await flush();

    expect(engineStub.destroys).toBe(1);
    expect(urls.revoked).toEqual(['blob:fake-0']);
    expect(controller.getState().items).toHaveLength(0);
    expect(controller.getState().status).toBe('idle');
  });

  it('clearing the playlist revokes every local object URL', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD), makeFile('b.mp4', MP4_HEAD)]);
    controller.clearPlaylist();
    expect(urls.revoked).toEqual(['blob:fake-0', 'blob:fake-1']);
    expect(controller.getState().items).toHaveLength(0);
  });

  it('dispose() is idempotent, destroys sessions, revokes all URLs, drops listeners', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();

    controller.dispose();
    controller.dispose();

    expect(engineStub.destroys).toBe(1);
    expect(urls.revoked).toEqual(['blob:fake-0']);
    expect(controller.isDisposed).toBe(true);
    const listenerCount = media.listeners.get('timeupdate')?.length ?? 0;
    expect(listenerCount).toBe(0);
  });

  it('tracks live listeners on the element while attached', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    expect(media.listeners.get('timeupdate')?.length).toBe(1);
    controller.attachElement(null);
    expect(media.listeners.get('timeupdate')?.length ?? 0).toBe(0);
  });
});

describe('subtitles', () => {
  it('accepts local SRT files (converted to VTT) and renders a <track> on selection', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    const srt = new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'subs.srt', { type: '' });
    await controller.addSubtitleFiles([srt]);

    const state = controller.getState();
    expect(state.subtitles).toHaveLength(1);
    expect(state.subtitles[0]).toMatchObject({ origin: 'local', ready: true });

    await controller.setSubtitle(state.subtitles[0]?.id ?? null);
    expect(media.appended).toHaveLength(1);
    const track = media.appended[0] as HTMLTrackElement;
    expect(track.kind).toBe('subtitles');
    expect(track.src).toMatch(/^blob:fake-/);
  });

  it('rejects unrelated subtitle content with a typed notice', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    await controller.addSubtitleFiles([new File(['no timings here at all'], 'x.txt')]);
    const state = controller.getState();
    expect(state.subtitles).toHaveLength(0);
    expect(state.notice).toContain('neither WebVTT nor SubRip');
  });

  it('fetches provider subtitle URLs once and serves them locally (no cross-origin media mode)', async () => {
    const media = makeMediaElement();
    const urls = makeUrls();
    const engineStub = makeRecordingEngine('native');
    const controller = controllerWith(media, makeRegistry(engineStub.engine), urls);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const subs: SubtitleFile[] = [{ url: 'https://cdn.example/sub.vtt', language: 'en' }];
      controller.setProviderSubtitles(subs);
      const state = controller.getState();
      expect(state.subtitles[0]).toMatchObject({ origin: 'provider', ready: false });
      await controller.setSubtitle(state.subtitles[0]?.id ?? null);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(media.appended).toHaveLength(1);

      // Switching back to the same track must NOT fetch again (cached locally).
      await controller.setSubtitle(null);
      expect(media.removed).toHaveLength(1);
      await controller.setSubtitle(state.subtitles[0]?.id ?? null);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(media.appended).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports subtitle fetch failures as a notice, never as fatal playback failure', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    try {
      controller.setProviderSubtitles([{ url: 'https://cdn.example/sub.srt', language: 'en' }]);
      const id = controller.getState().subtitles[0]?.id ?? null;
      await controller.setSubtitle(id);
      const state = controller.getState();
      expect(state.status).not.toBe('error');
      expect(state.notice).toContain('could not be loaded');
      expect(state.activeSubtitleId).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('transport controls', () => {
  it('seeks within bounds, clamps volume, and updates rate', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();
    media.emit('durationchange');
    (media.el as unknown as { duration: number }).duration = 10;
    media.emit('durationchange');

    controller.seek(15);
    expect(media.el.currentTime).toBe(10);
    controller.seek(-3);
    expect(media.el.currentTime).toBe(0);
    controller.setVolume(2);
    expect(media.el.volume).toBe(1);
    controller.setRate(9);
    expect(media.el.playbackRate).toBe(4);
    controller.toggleMute();
    expect(media.el.muted).toBe(true);
  });

  it('emits snapshot updates to subscribers on state changes', async () => {
    const media = makeMediaElement();
    const controller = controllerWith(media, makeRegistry(makeRecordingEngine('native').engine), makeUrls());
    const seen: PlaybackState[] = [];
    controller.subscribe(() => seen.push(controller.getState()));
    await controller.addLocalFiles([makeFile('a.mp4', MP4_HEAD)]);
    await flush();
    expect(seen.length).toBeGreaterThan(0);
    // Snapshots are immutable values: identical reference between emits.
    expect(controller.getState()).toBe(controller.getState());
  });
});
