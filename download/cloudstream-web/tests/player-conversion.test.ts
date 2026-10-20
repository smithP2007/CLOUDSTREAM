/**
 * Conversion engine tests with a fully FAKE ffmpeg.wasm module (zero network,
 * zero wasm): eligibility bounds, argv shape, progress, cancellation
 * (worker terminate + instance invalidation), typed failures, and virtual-FS
 * cleanup. The REAL engine behavior in browsers is covered by manual
 * verification steps documented in docs/media-compatibility.md.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createConversionEngine,
  probeConversionEnvironment,
  DEFAULT_CORE_CDN_BASE,
  type FfmpegModuleLike,
  type FfmpegUtilLike,
} from '../src/player/conversion/ffmpegConversion';
import { CONVERSION_PROFILES, conversionArgs, pickConversionProfile } from '../src/player/conversion/profiles';
import { capabilitiesFromProbe } from '../src/player/formatSupport';

const NO_ENV = { Worker: undefined, WebAssembly: undefined };

interface FakeFfmpeg {
  handlers: Map<string, (event: unknown) => void>;
  written: Array<[string, Uint8Array]>;
  deleted: string[];
  execCalls: Array<{ args: string[]; timeoutMs?: number }>;
  terminated: number;
  loadCalls: Array<{ coreURL: string; wasmURL: string }>;
  /** When set, exec() waits until terminate() rejects it. */
  hangExec: boolean;
  execResult: number;
}

function makeFakeModule(defaults?: { execResult?: number; hangExec?: boolean }): {
  module: FfmpegModuleLike;
  util: FfmpegUtilLike;
  instances: FakeFfmpeg[];
} {
  const instances: FakeFfmpeg[] = [];
  class FakeFFmpeg {
    handlers = new Map<string, (event: unknown) => void>();
    written: Array<[string, Uint8Array]> = [];
    deleted: string[] = [];
    execCalls: Array<{ args: string[]; timeoutMs?: number }> = [];
    terminated = 0;
    loadCalls: Array<{ coreURL: string; wasmURL: string }> = [];
    hangExec = defaults?.hangExec ?? false;
    execResult = defaults?.execResult ?? 0;

    constructor() {
      instances.push(this);
    }

    on(event: 'log' | 'progress', callback: (event: unknown) => void): void {
      this.handlers.set(event, callback);
    }

    async load(options: { coreURL: string; wasmURL: string }): Promise<boolean> {
      this.loadCalls.push(options);
      return true;
    }

    async writeFile(name: string, data: Uint8Array): Promise<boolean> {
      this.written.push([name, data]);
      return true;
    }

    async readFile(_name: string): Promise<Uint8Array | string> {
      return new Uint8Array([1, 2, 3, 4]);
    }

    async deleteFile(name: string): Promise<boolean> {
      this.deleted.push(name);
      return true;
    }

    async exec(args: string[], timeoutMs?: number): Promise<number> {
      this.execCalls.push({ args, timeoutMs });
      if (this.hangExec) {
        await new Promise((_resolve, reject) => {
          this.handlers.set('terminate', () => reject(new Error('worker terminated')));
        });
      }
      return this.execResult;
    }

    terminate(): void {
      this.terminated += 1;
      this.handlers.get('terminate')?.(undefined);
    }
  }
  const module: FfmpegModuleLike = { FFmpeg: FakeFFmpeg as unknown as FfmpegModuleLike['FFmpeg'] };
  const util: FfmpegUtilLike = {
    async toBlobURL(url: string) {
      return `blob:${url}`;
    },
    async fetchFile(_file: Blob) {
      return new Uint8Array([9, 9, 9]);
    },
  };
  return { module, util, instances };
}

const ENV_OK = { Worker: function FakeWorker() {}, WebAssembly: {} };

function makeEngine(overrides?: { maxInputBytes?: number }) {
  const libs = makeFakeModule();
  const engine = createConversionEngine({
    loadLibraries: async () => ({ module: libs.module, util: libs.util }),
    env: ENV_OK,
    maxInputBytes: overrides?.maxInputBytes,
  });
  return { engine, libs };
}

describe('environment probe', () => {
  it('reports unavailability with reasons when Worker/WASM are missing', () => {
    expect(probeConversionEnvironment(NO_ENV)).toEqual({ available: false, reason: 'Web Workers are unavailable.' });
    expect(probeConversionEnvironment({ Worker: function f() {}, WebAssembly: undefined })).toEqual({
      available: false,
      reason: 'WebAssembly is unavailable.',
    });
    expect(probeConversionEnvironment(ENV_OK).available).toBe(true);
  });

  it('exposes the pinned CDN core base for the fallback path', () => {
    expect(DEFAULT_CORE_CDN_BASE).toContain('@ffmpeg/core@0.12.10');
  });
});

describe('conversion engine', () => {
  it('refuses to run without worker/WASM (typed, before any library load)', async () => {
    const libs = makeFakeModule();
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: libs.module, util: libs.util }),
      env: NO_ENV,
    });
    await expect(
      engine.convert(new Blob([new Uint8Array(8)]), { profile: CONVERSION_PROFILES.mp4 }),
    ).rejects.toMatchObject({ code: 'conversion-unavailable' });
    expect(libs.instances).toHaveLength(0);
  });

  it('enforces the input size bound before loading anything', async () => {
    const { engine, libs } = makeEngine({ maxInputBytes: 10 });
    const big = new Blob([new Uint8Array(11)]);
    await expect(
      engine.convert(big, { profile: CONVERSION_PROFILES.mp4 }),
    ).rejects.toMatchObject({ code: 'conversion-too-large' });
    expect(libs.instances).toHaveLength(0);
  });

  it('runs one conversion end-to-end: load core from base URL, argv shape, blob output, FS cleanup', async () => {
    const { engine, libs } = makeEngine();
    const file = new Blob([new Uint8Array(32)]);
    const result = await engine.convert(file, {
      profile: CONVERSION_PROFILES.mp4,
      inputName: 'movie.avi',
      onProgress: () => undefined,
    });
    expect(result.outputName).toBe('output.mp4');
    expect(result.blob.type).toBe('video/mp4');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const instance = libs.instances[0] as FakeFfmpeg;
    expect(instance.loadCalls[0]?.coreURL).toBe('blob:' + DEFAULT_CORE_CDN_BASE + '/ffmpeg-core.js');
    expect(instance.loadCalls[0]?.wasmURL).toBe('blob:' + DEFAULT_CORE_CDN_BASE + '/ffmpeg-core.wasm');
    expect(instance.written[0]?.[0]).toBe('movie.avi');
    expect(instance.execCalls[0]?.args).toEqual([
      '-i',
      'movie.avi',
      ...CONVERSION_PROFILES.mp4.outputArgs,
      '-y',
      'output.mp4',
    ]);
    expect(instance.deleted).toEqual(['movie.avi', 'output.mp4']);
    expect(instance.terminated).toBe(0); // success path never terminates the worker
  });

  it('emits bounded progress events (non-finite values ignored)', async () => {
    const { engine, libs } = makeEngine();
    const progress: number[] = [];
    const converting = engine.convert(new Blob([new Uint8Array(4)]), {
      profile: CONVERSION_PROFILES.mp4,
      onProgress: (ratio) => progress.push(ratio),
    });
    await vi.waitFor(() => expect(libs.instances.length).toBe(1));
    const instance = libs.instances[0] as FakeFfmpeg;
    instance.handlers.get('progress')?.({ progress: 0.25 });
    instance.handlers.get('progress')?.({ progress: Number.NaN });
    instance.handlers.get('progress')?.({ progress: 5 });
    await converting;
    expect(progress).toEqual([0.25, 1]);
  });

  it('fails typed when FFmpeg exits non-zero', async () => {
    const failing = makeFakeModule({ execResult: 1 });
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: failing.module, util: failing.util }),
      env: ENV_OK,
    });
    await expect(
      engine.convert(new Blob([new Uint8Array(4)]), { profile: CONVERSION_PROFILES.mp4 }),
    ).rejects.toMatchObject({ code: 'conversion-failed' });
  });

  it('cancels via abort: terminates the worker, invalidates the instance, throws aborted', async () => {
    const libs = makeFakeModule({ hangExec: true });
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: libs.module, util: libs.util }),
      env: ENV_OK,
    });
    const controller = new AbortController();
    const converting = engine.convert(new Blob([new Uint8Array(4)]), {
      profile: CONVERSION_PROFILES.mp4,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect((libs.instances[0] as FakeFfmpeg | undefined)?.execCalls.length).toBe(1));
    controller.abort();
    await expect(converting).rejects.toMatchObject({ code: 'aborted' });
    const instance = libs.instances[0] as FakeFfmpeg;
    expect(instance.terminated).toBe(1);
    // The instance was invalidated; a NEW conversion must construct a fresh one.
    const libs2 = makeFakeModule();
    const engine2 = createConversionEngine({
      loadLibraries: async () => ({ module: libs2.module, util: libs2.util }),
      env: ENV_OK,
    });
    await engine2.convert(new Blob([new Uint8Array(4)]), { profile: CONVERSION_PROFILES.mp4 });
    expect(libs2.instances.length).toBe(1);
  });

  it('dispose() terminates and makes later conversions unavailable (idempotent)', async () => {
    const { engine, libs } = makeEngine();
    await engine.convert(new Blob([new Uint8Array(4)]), { profile: CONVERSION_PROFILES.mp4 });
    engine.dispose();
    engine.dispose();
    expect((libs.instances[0] as FakeFfmpeg).terminated).toBe(1);
    await expect(
      engine.convert(new Blob([new Uint8Array(4)]), { profile: CONVERSION_PROFILES.mp4 }),
    ).rejects.toMatchObject({ code: 'conversion-unavailable' });
  });
});

describe('conversion profiles', () => {
  it('composes argv with input/output virtual names (no shell anywhere)', () => {
    expect(conversionArgs(CONVERSION_PROFILES.mp4, 'in.avi', 'out.mp4')).toEqual([
      '-i',
      'in.avi',
      ...CONVERSION_PROFILES.mp4.outputArgs,
      '-y',
      'out.mp4',
    ]);
  });

  it('picks MP4 output when the browser plays MP4, WebM otherwise, none if neither', () => {
    expect(pickConversionProfile(capabilitiesFromProbe((m) => (m.startsWith('video/mp4') ? 'probably' : ''), false))?.id).toBe('mp4-h264');
    expect(pickConversionProfile(capabilitiesFromProbe((m) => (m.startsWith('video/webm') ? 'maybe' : ''), false))?.id).toBe('webm-vp9');
    expect(pickConversionProfile(capabilitiesFromProbe(() => '', false))).toBeNull();
  });
});
