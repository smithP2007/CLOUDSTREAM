/**
 * Client-side conversion engine (ffmpeg.wasm) — OPTIONAL, LAZY, LOCAL-ONLY.
 *
 * Hard rules (owner instruction §5; decisions D21.5/D22):
 *  - the library is dynamically imported only when a conversion actually runs;
 *  - the GPL-licensed core (@ffmpeg/core) is NEVER bundled or committed — it is
 *    loaded at runtime from a self-hosted path (demo) or the pinned CDN;
 *  - input files stay on the device (the wasm FFmpeg reads the Blob directly);
 *  - bounded input size (default 1.5 GiB), cancellable (worker terminate),
 *    progress is best-effort (upstream marks the hook experimental);
 *  - a browser without Worker/WASM reports typed unavailability instead of
 *    attempting anything;
 *  - the engine takes FFmpeg ARGV directly (no shell anywhere — nothing to
 *    inject into).
 */

import { PlaybackError } from '../errors';
import { conversionArgs, DEFAULT_MAX_CONVERT_INPUT_BYTES, type ConversionProfile } from './profiles';
import { safeVirtualName } from '../localMedia';

/** Minimal structural view of the @ffmpeg/ffmpeg module we use. */
export interface FfmpegInstanceLike {
  on(event: 'log', callback: (event: { message: string }) => void): void;
  on(event: 'progress', callback: (event: { progress: number }) => void): void;
  load(options: { coreURL: string; wasmURL: string }): Promise<boolean>;
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array | string>;
  deleteFile(name: string): Promise<boolean>;
  exec(args: string[], timeoutMs?: number): Promise<number>;
  terminate(): void;
}

export interface FfmpegModuleLike {
  FFmpeg: new () => FfmpegInstanceLike;
}

export interface FfmpegUtilLike {
  toBlobURL(url: string, mimeType: string): Promise<string>;
  fetchFile(file: Blob | URL | string): Promise<Uint8Array>;
}

export type FfmpegLibraryLoader = () => Promise<{ module: FfmpegModuleLike; util: FfmpegUtilLike }>;

export const defaultFfmpegLoader: FfmpegLibraryLoader = async () => {
  const [module, util] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
  return {
    module: module as unknown as FfmpegModuleLike,
    util: util as unknown as FfmpegUtilLike,
  };
};

export interface ConversionEngineOptions {
  /** Library loader seam (tests inject fakes; default = real dynamic imports). */
  loadLibraries?: FfmpegLibraryLoader;
  /** Core base URL (self-hosted path); defaults to the pinned CDN. */
  coreBaseUrl?: string;
  maxInputBytes?: number;
  /** exec() kill switch; conversion is bounded in time as well as size. */
  execTimeoutMs?: number;
  /** Environment override for tests (defaults to globalThis). */
  env?: { Worker?: unknown; WebAssembly?: unknown };
}

export const DEFAULT_CORE_CDN_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const DEFAULT_EXEC_TIMEOUT_MS = 30 * 60_000;

export interface ConversionResult {
  blob: Blob;
  outputName: string;
  durationMs: number;
}

export interface ConversionRequest {
  profile: ConversionProfile;
  inputName?: string;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export interface ConversionEngine {
  /** Static environment probe: no worker/WASM means conversion cannot run. */
  readonly availability: { available: boolean; reason?: string };
  convert(file: Blob, request: ConversionRequest): Promise<ConversionResult>;
  dispose(): void;
}

export function probeConversionEnvironment(env: { Worker?: unknown; WebAssembly?: unknown } = globalThis): {
  available: boolean;
  reason?: string;
} {
  if (typeof env.Worker !== 'function') return { available: false, reason: 'Web Workers are unavailable.' };
  if (typeof env.WebAssembly !== 'object') return { available: false, reason: 'WebAssembly is unavailable.' };
  return { available: true };
}

export function createConversionEngine(options: ConversionEngineOptions = {}): ConversionEngine {
  const loadLibraries = options.loadLibraries ?? defaultFfmpegLoader;
  const coreBaseUrl = options.coreBaseUrl ?? DEFAULT_CORE_CDN_BASE;
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_CONVERT_INPUT_BYTES;
  const execTimeoutMs = options.execTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;

  const availability = probeConversionEnvironment(options.env);
  let librariesPromise: Promise<{ module: FfmpegModuleLike; util: FfmpegUtilLike }> | null = null;
  let ffmpeg: FfmpegInstanceLike | null = null;
  let ready: Promise<{ ffmpeg: FfmpegInstanceLike; util: FfmpegUtilLike }> | null = null;
  let disposed = false;

  async function getReady(): Promise<{ ffmpeg: FfmpegInstanceLike; util: FfmpegUtilLike }> {
    if (ffmpeg && ready) return ready;
    if (disposed) throw new PlaybackError('conversion-unavailable', 'The conversion engine was disposed.');
    if (!librariesPromise) librariesPromise = loadLibraries();
    ready = (async () => {
      const { module, util } = await librariesPromise as { module: FfmpegModuleLike; util: FfmpegUtilLike };
      const instance = new module.FFmpeg();
      const coreURL = await util.toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await util.toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, 'application/wasm');
      await instance.load({ coreURL, wasmURL });
      ffmpeg = instance;
      return { ffmpeg: instance, util };
    })();
    try {
      return await ready;
    } catch (error) {
      ready = null; // allow retry after a failed lazy load
      throw error;
    }
  }

  return {
    availability,

    async convert(file: Blob, request: ConversionRequest): Promise<ConversionResult> {
      if (disposed) throw new PlaybackError('conversion-unavailable', 'The conversion engine was disposed.');
      if (!availability.available) {
        throw new PlaybackError('conversion-unavailable', availability.reason);
      }
      if (file.size > maxInputBytes) {
        throw new PlaybackError(
          'conversion-too-large',
          `This file (${file.size} bytes) exceeds the conversion input limit (${maxInputBytes} bytes).`,
        );
      }
      if (request.signal?.aborted) throw new PlaybackError('aborted');

      const started = Date.now();
      const inputName = safeVirtualName(request.inputName ?? 'input.bin', 'bin');
      const outputName = `output.${request.profile.ext}`;
      const { ffmpeg: instance, util } = await getReady();

      const onProgress = (event: { progress: number }): void => {
        if (typeof event?.progress !== 'number' || !Number.isFinite(event.progress)) return;
        request.onProgress?.(Math.min(Math.max(event.progress, 0), 1));
      };
      instance.on('progress', onProgress);

      const onAbort = (): void => {
        // Terminating the worker is the documented cancellation path; the
        // instance becomes unusable and is rebuilt lazily on the next run.
        instance.terminate();
        ffmpeg = null;
        ready = null;
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        await instance.writeFile(inputName, await util.fetchFile(file));
        const exitCode = await instance.exec(conversionArgs(request.profile, inputName, outputName), execTimeoutMs);
        if (exitCode !== 0) {
          throw new PlaybackError('conversion-failed', `FFmpeg exited with code ${exitCode}.`);
        }
        const output = await instance.readFile(outputName);
        if (typeof output === 'string') {
          throw new PlaybackError('conversion-failed', 'Unexpected text output from FFmpeg.');
        }
        if (request.signal?.aborted) throw new PlaybackError('aborted');
        // readFile() returns a wasm-heap view; copy into a plain Blob (the
        // cast is safe: FFmpeg's virtual FS never returns SharedArrayBuffer).
        const blob = new Blob([output as unknown as BlobPart], { type: request.profile.mime });
        return { blob, outputName, durationMs: Date.now() - started };
      } catch (error) {
        if (request.signal?.aborted) throw new PlaybackError('aborted');
        throw toConversionError(error);
      } finally {
        request.signal?.removeEventListener('abort', onAbort);
        // Best-effort virtual FS cleanup; never masks the primary outcome.
        await instance.deleteFile(inputName).catch(() => undefined);
        await instance.deleteFile(outputName).catch(() => undefined);
      }
    },

    dispose(): void {
      disposed = true;
      if (ffmpeg) {
        try {
          ffmpeg.terminate();
        } catch {
          /* already dead */
        }
      }
      ffmpeg = null;
      ready = null;
    },
  };
}

function toConversionError(error: unknown): PlaybackError {
  if (error instanceof PlaybackError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new PlaybackError('aborted');
  const message = error instanceof Error ? error.message : '';
  return new PlaybackError('conversion-failed', message ? `Converting this file failed: ${message}` : undefined);
}
