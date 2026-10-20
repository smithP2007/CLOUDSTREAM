/**
 * D25 core-integrity tests: the conversion engine must verify the fetched
 * ffmpeg.wasm core bytes against the pinned SHA-256 digests BEFORE anything
 * is instantiated, fail closed on mismatch, and keep the legacy
 * verification-disabled path byte-compatible with the audited behavior.
 * All I/O is faked — no network, no wasm (the REAL verified load is covered
 * by the e2e suites against the self-hosted core).
 */

import { describe, expect, it } from 'vitest';
import {
  coreHashEquals,
  defaultCoreIo,
  fetchAndVerifyArtifact,
  PINNED_CORE_SHA256,
  PINNED_CORE_VERSION,
  type CoreFetchResponse,
  type CoreIo,
} from '../src/player/conversion/coreIntegrity';
import pinned from '../src/player/conversion/pinned-core-hashes.json';
import { createConversionEngine, type FfmpegModuleLike, type FfmpegUtilLike } from '../src/player/conversion/ffmpegConversion';
import { CONVERSION_PROFILES } from '../src/player/conversion/profiles';

// The digests recorded in docs/media-compatibility.md §5 during the Task 11
// audit — asserted here so the JSON, the code and the audit record cannot
// drift apart silently.
const AUDIT_JS_SHA256 = '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3';
const AUDIT_WASM_SHA256 = '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7';

describe('pinned core digests', () => {
  it('match the audit record (media-compatibility.md §5)', () => {
    expect(pinned.version).toBe('0.12.10');
    expect(PINNED_CORE_VERSION).toBe('0.12.10');
    expect(PINNED_CORE_SHA256.js).toBe(AUDIT_JS_SHA256);
    expect(PINNED_CORE_SHA256.wasm).toBe(AUDIT_WASM_SHA256);
  });
});

describe('coreHashEquals', () => {
  it('accepts exact and case/whitespace variants, rejects any real difference', () => {
    const hash = AUDIT_JS_SHA256;
    expect(coreHashEquals(hash, hash)).toBe(true);
    expect(coreHashEquals(`  ${hash.toUpperCase()}\n`, hash)).toBe(true);
    expect(coreHashEquals(hash.slice(0, 63), hash)).toBe(false);
    expect(coreHashEquals(`${hash.slice(0, 63)}0`, hash)).toBe(false);
    expect(coreHashEquals('', hash)).toBe(false);
  });
});

describe('fetchAndVerifyArtifact', () => {
  const EXPECTED = AUDIT_JS_SHA256;
  const GOOD_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

  function makeIo(overrides?: {
    body?: Uint8Array;
    status?: number;
    ok?: boolean;
    fetchThrows?: boolean;
    digestValue?: string;
    calls?: string[];
  }): CoreIo {
    const base = defaultCoreIo();
    return {
      fetch: async (url) => {
        overrides?.calls?.push(url);
        if (overrides?.fetchThrows) throw new Error('offline');
        const body = overrides?.body ?? GOOD_BYTES;
        const buffer = body.slice().buffer as ArrayBuffer;
        const response: CoreFetchResponse = {
          ok: overrides?.ok ?? true,
          status: overrides?.status ?? 200,
          arrayBuffer: async () => buffer,
        };
        return response;
      },
      digest: async () => overrides?.digestValue ?? EXPECTED,
      createObjectUrl: base.createObjectUrl,
      revokeObjectUrl: base.revokeObjectUrl,
    };
  }

  it('returns the verified bytes on a digest match', async () => {
    const bytes = await fetchAndVerifyArtifact('/x/ffmpeg-core.js', 'ffmpeg-core.js', EXPECTED, makeIo());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fails closed with conversion-core-integrity on a digest mismatch', async () => {
    const promise = fetchAndVerifyArtifact(
      '/x/ffmpeg-core.js',
      'ffmpeg-core.js',
      EXPECTED,
      makeIo({ digestValue: 'deadbeef'.repeat(8) }),
    );
    await expect(promise).rejects.toMatchObject({ code: 'conversion-core-integrity' });
  });

  it('maps HTTP failures to network-error and names only the artifact (no URLs)', async () => {
    const promise = fetchAndVerifyArtifact('/secret/path/x.js', 'ffmpeg-core.js', EXPECTED, makeIo({ ok: false, status: 404 }));
    await expect(promise).rejects.toMatchObject({ code: 'network-error' });
    await promise.catch((error: Error) => {
      expect(error.message).toContain('ffmpeg-core.js');
      expect(error.message).toContain('404');
      expect(error.message).not.toContain('/secret/path');
    });
  });

  it('maps fetch rejections to network-error', async () => {
    const promise = fetchAndVerifyArtifact('/x/ffmpeg-core.js', 'ffmpeg-core.js', EXPECTED, makeIo({ fetchThrows: true }));
    await expect(promise).rejects.toMatchObject({ code: 'network-error' });
  });
});

interface FakeInstance {
  loadCalls: Array<{ coreURL: string; wasmURL: string }>;
  written: Array<[string, Uint8Array]>;
  readResult: Uint8Array;
  deleted: string[];
  execResult: number;
}

function makeFakes(good: { js: Uint8Array; wasm: Uint8Array }, options?: { wasmDigest?: string }) {
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const fetchedUrls: string[] = [];
  const instances: FakeInstance[] = [];
  let wasmServed = 0;
  const serveBrokenWasmOnce = options?.wasmDigest != null;

  class FakeFFmpeg {
    loadCalls: Array<{ coreURL: string; wasmURL: string }> = [];
    written: Array<[string, Uint8Array]> = [];
    deleted: string[] = [];
    constructor() {
      instances.push({
        loadCalls: this.loadCalls,
        written: this.written,
        readResult: new Uint8Array([9, 8, 7]),
        deleted: this.deleted,
        execResult: 0,
      });
    }
    on(): void {}
    async load(payload: { coreURL: string; wasmURL: string }): Promise<boolean> {
      this.loadCalls.push(payload);
      return true;
    }
    async writeFile(name: string, data: Uint8Array): Promise<boolean> {
      this.written.push([name, data]);
      return true;
    }
    async readFile(): Promise<Uint8Array | string> {
      return new Uint8Array([9, 8, 7]);
    }
    async deleteFile(name: string): Promise<boolean> {
      this.deleted.push(name);
      return true;
    }
    async exec(): Promise<number> {
      return 0;
    }
    terminate(): void {}
  }

  const module: FfmpegModuleLike = { FFmpeg: FakeFFmpeg as unknown as new () => never };
  const util: FfmpegUtilLike = {
    toBlobURL: async () => 'blob:legacy',
    fetchFile: async () => new Uint8Array([1, 1, 1]),
  };

  const io: CoreIo = {
    fetch: async (url) => {
      fetchedUrls.push(url);
      const isJs = url.endsWith('ffmpeg-core.js');
      const body = isJs ? good.js : good.wasm;
      const buffer = body.slice().buffer as ArrayBuffer;
      return { ok: true, status: 200, arrayBuffer: async () => buffer };
    },
    digest: async (data) => {
      const isJs = data[0] === good.js[0] && data.length === good.js.length;
      if (isJs) return PINNED_CORE_SHA256.js;
      // First wasm fetch is (optionally) tampered; retries serve the real thing.
      if (serveBrokenWasmOnce && wasmServed === 0) {
        wasmServed += 1;
        return options!.wasmDigest!;
      }
      wasmServed += 1;
      return PINNED_CORE_SHA256.wasm;
    },
    createObjectUrl: (bytes, mime) => {
      const url = `blob:fake-${createdUrls.length}:${mime}`;
      createdUrls.push(url);
      void bytes;
      return url;
    },
    revokeObjectUrl: (url) => {
      revokedUrls.push(url);
    },
  };

  return { module, util, io, createdUrls, revokedUrls, fetchedUrls, instances };
}

const GOOD_JS = new Uint8Array([10, 20, 30]);
const GOOD_WASM = new Uint8Array([40, 50, 60]);
// Satisfies probeConversionEnvironment without real workers/wasm (fakes only).
const ENV_OK = { Worker: function FakeWorker() {}, WebAssembly: {} };

describe('conversion engine core verification (D25)', () => {
  it('verifies both artifacts, loads from blob URLs, and revokes them after load', async () => {
    const fakes = makeFakes({ js: GOOD_JS, wasm: GOOD_WASM });
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: fakes.module, util: fakes.util }),
      coreBaseUrl: '/ffmpeg-core',
      coreIntegrity: { io: fakes.io },
      env: ENV_OK,
    });

    const result = await engine.convert(new Blob([new Uint8Array([1])]), { profile: CONVERSION_PROFILES.webm });
    expect(result.outputName).toBe('output.webm');
    // Both artifacts fetched from the self-hosted base BEFORE any load:
    expect(fakes.fetchedUrls).toEqual(['/ffmpeg-core/ffmpeg-core.js', '/ffmpeg-core/ffmpeg-core.wasm']);
    expect(fakes.instances[0]?.loadCalls).toHaveLength(1);
    const load = fakes.instances[0]!.loadCalls[0]!;
    expect(load.coreURL.startsWith('blob:fake-0:')).toBe(true);
    expect(load.wasmURL.startsWith('blob:fake-1:')).toBe(true);
    // Object URLs are OURS — revoked exactly once each after load resolved.
    expect(fakes.revokedUrls).toEqual([load.coreURL, load.wasmURL]);
    engine.dispose();
  });

  it('fails closed with conversion-core-integrity BEFORE load on a tampered core, and stays retryable', async () => {
    const fakes = makeFakes({ js: GOOD_JS, wasm: GOOD_WASM }, { wasmDigest: 'deadbeef'.repeat(8) });
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: fakes.module, util: fakes.util }),
      coreBaseUrl: '/ffmpeg-core',
      coreIntegrity: { io: fakes.io },
      env: ENV_OK,
    });

    await expect(
      engine.convert(new Blob([new Uint8Array([1])]), { profile: CONVERSION_PROFILES.webm }),
    ).rejects.toMatchObject({ code: 'conversion-core-integrity' });
    // Nothing was loaded or instantiated:
    expect(fakes.instances[0]?.loadCalls ?? []).toHaveLength(0);
    expect(fakes.createdUrls).toEqual([]);

    // The engine resets its lazy state on failure — a clean retry succeeds
    // with a FRESH instance (the tampered first core never loaded).
    const result = await engine.convert(new Blob([new Uint8Array([1])]), { profile: CONVERSION_PROFILES.webm });
    expect(result.outputName).toBe('output.webm');
    expect(fakes.instances).toHaveLength(2);
    expect(fakes.instances[0]?.loadCalls).toHaveLength(0);
    expect(fakes.instances[1]?.loadCalls).toHaveLength(1);
    engine.dispose();
  });

  it('keeps the verification-disabled path on util.toBlobURL with no fetch', async () => {
    const fakes = makeFakes({ js: GOOD_JS, wasm: GOOD_WASM });
    const engine = createConversionEngine({
      loadLibraries: async () => ({ module: fakes.module, util: fakes.util }),
      coreBaseUrl: '/ffmpeg-core',
      coreIntegrity: false,
      env: ENV_OK,
    });
    await engine.convert(new Blob([new Uint8Array([1])]), { profile: CONVERSION_PROFILES.webm });
    expect(fakes.fetchedUrls).toEqual([]);
    expect(fakes.instances[0]?.loadCalls[0]).toEqual({ coreURL: 'blob:legacy', wasmURL: 'blob:legacy' });
    expect(fakes.createdUrls).toEqual([]);
    engine.dispose();
  });
});

