/**
 * HLS engine. The library (hls.js, Apache-2.0) is DYNAMICALLY IMPORTED only
 * when an HLS source plays — it never appears in the initial bundle (D22.1).
 *
 * Selection logic:
 *  - MSE available  -> hls.js (with bounded retry configuration);
 *  - no MSE but native HLS (`application/vnd.apple.mpegurl`, Safari) -> plain `src`;
 *  - neither        -> unsupported (the decision flow reports it before attach).
 *
 * Manifest/segment failures map onto the typed playback error vocabulary;
 * fatal errors call `onFatal` ONCE so the controller can fall back bounded.
 */

import type {
  EngineAttachOptions,
  EngineSession,
  EngineId,
  MediaCapabilities,
  PlaybackEngine,
  PlayerSource,
} from '../types';
import { PlaybackError } from '../errors';

/** Minimal structural view of the hls.js module surface we use. */
export interface HlsInstanceLike {
  on(event: string, callback: (data: unknown) => void): void;
  off?(event: string, callback: (data: unknown) => void): void;
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  startLoad(): void;
  destroy(): void;
}

export type HlsConstructor = (new (config?: Record<string, unknown>) => HlsInstanceLike) & {
  isSupported(): boolean;
  Events: { readonly ERROR: string };
};

export type HlsLibraryLoader = () => Promise<HlsConstructor>;

/** Default loader: dynamic import — erased from the static graph. */
export const defaultHlsLoader: HlsLibraryLoader = async () => {
  const mod = await import('hls.js');
  return mod.default as unknown as HlsConstructor;
};

export interface HlsErrorData {
  readonly type?: unknown;
  readonly details?: unknown;
  readonly fatal?: unknown;
}

function classifyHlsError(data: HlsErrorData): PlaybackError {
  const details = typeof data.details === 'string' ? data.details : '';
  if (details.startsWith('manifest')) return new PlaybackError('manifest-error', `HLS manifest error (${details}).`);
  if (data.type === 'networkError') return new PlaybackError('network-error', `HLS network error (${details}).`);
  if (data.type === 'mediaError') return new PlaybackError('decoding-error', `HLS media error (${details}).`);
  return new PlaybackError('unknown', `HLS error (${details || 'unclassified'}).`);
}

/**
 * Bounded retry posture: hls.js retries internally; the caps below keep the
 * total retry storm small before a fatal error surfaces (no infinite loops).
 */
const HLS_CONFIG = {
  maxBufferLength: 30,
  backBufferLength: 90,
  manifestLoadingTimeOut: 15_000,
  manifestLoadingMaxRetry: 2,
  levelLoadingMaxRetry: 2,
  fragLoadingMaxRetry: 4,
} as const;

export function createHlsEngine(options?: { loadLibrary?: HlsLibraryLoader }): PlaybackEngine {
  const loadLibrary = options?.loadLibrary ?? defaultHlsLoader;

  return {
    id: 'hls' as EngineId,

    canPlay(source: PlayerSource, caps: MediaCapabilities): { supported: boolean; reason: string } {
      if (source.kind !== 'hls') return { supported: false, reason: 'Source is not HLS.' };
      if (caps.hasMse) return { supported: true, reason: 'MSE available for hls.js.' };
      if (caps.canPlayType('application/vnd.apple.mpegurl') !== '') {
        return { supported: true, reason: 'Native HLS support available.' };
      }
      return { supported: false, reason: 'Neither MSE nor native HLS is available.' };
    },

    async attach(media: HTMLMediaElement, source: PlayerSource, options: EngineAttachOptions): Promise<EngineSession> {
      let Hls: HlsConstructor;
      try {
        Hls = await loadLibrary();
      } catch (error) {
        throw new PlaybackError(
          'engine-missing',
          'The HLS engine (hls.js) could not be loaded.',
          error instanceof Error ? error.message : undefined,
        );
      }

      // Native HLS fallback (Safari-class): plain src, no MSE involved.
      if (!Hls.isSupported()) {
        media.src = source.url;
        media.load();
        if (options.autoplay) await media.play().catch(() => undefined);
        return {
          engineId: 'native',
          destroy(): void {
            media.removeAttribute('src');
            media.load();
          },
        };
      }

      const hls = new Hls(HLS_CONFIG);
      let settled = false;
      const onError = (data: unknown): void => {
        const error = classifyHlsError((data ?? {}) as HlsErrorData);
        const fatal = (data as HlsErrorData | null)?.fatal === true;
        if (!fatal) {
          options.onNotice(`HLS recovered from a segment issue: ${error.message}`);
          return;
        }
        if (settled) return;
        settled = true; // one fatal report per session — the controller owns fallback
        options.onFatal(error);
      };
      hls.on(Hls.Events.ERROR, onError);
      hls.attachMedia(media);
      hls.loadSource(source.url);
      if (options.autoplay) await media.play().catch(() => undefined);

      return {
        engineId: 'hls',
        destroy(): void {
          settled = true;
          hls.destroy();
        },
      };
    },
  };
}
