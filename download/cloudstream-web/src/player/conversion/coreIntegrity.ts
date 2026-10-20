/**
 * Integrity verification for the runtime-fetched ffmpeg.wasm core (D25).
 *
 * The GPL core (@ffmpeg/core 0.12.10, ESM build) is fetched at runtime — from
 * a self-hosted path or the pinned CDN fallback. Before ANY of its bytes are
 * instantiated (wasm) or imported (JS loader), the engine verifies their
 * SHA-256 against the pinned digests recorded from the actual artifact during
 * the Task 11 audit (`pinned-core-hashes.json`, cross-checked in
 * docs/media-compatibility.md §5). A mismatch fails CLOSED with a typed
 * `conversion-core-integrity` error — nothing is executed, nothing falls back
 * silently. This closes the supply-chain gap recorded in
 * docs/deployment-requirements.md §3: both artifacts are fetched as bytes and
 * digested, which is equivalent to `<script integrity>` SRI for these loads
 * (and strictly stronger than trusting the CDN).
 *
 * NOTE (audit honesty): the digests pin the npm-published artifact, NOT an
 * upstream build we compiled — a compromised npm tarball at the pinned
 * version would still match. Re-verify with `npm run verify:core` whenever
 * the version is bumped, and prefer the self-hosted path (the digests then
 * detect ANY drift between what the operator staged and what was audited).
 */

import { PlaybackError } from '../errors';
import pinned from './pinned-core-hashes.json';

export interface CoreArtifactHashes {
  /** SHA-256 (hex) of the ESM loader JS (ffmpeg-core.js). */
  js: string;
  /** SHA-256 (hex) of the WebAssembly module (ffmpeg-core.wasm). */
  wasm: string;
}

/** Pinned version the digests were computed from. */
export const PINNED_CORE_VERSION: string = pinned.version;

/** Pinned SHA-256 digests for the @ffmpeg/core@0.12.10 ESM artifacts. */
export const PINNED_CORE_SHA256: CoreArtifactHashes = {
  js: pinned.sha256['ffmpeg-core.js'],
  wasm: pinned.sha256['ffmpeg-core.wasm'],
};

/** Structural fetch result — keeps fakes trivial in tests. */
export interface CoreFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type CoreFetch = (url: string) => Promise<CoreFetchResponse>;
/** Returns the lowercase hex SHA-256 of `data`. */
export type CoreDigest = (data: Uint8Array) => Promise<string>;
export type CoreObjectUrlFactory = (bytes: Uint8Array, mime: string) => string;
export type CoreObjectUrlRevoker = (url: string) => void;

/** Injected I/O for artifact verification (defaults to the browser globals). */
export interface CoreIo {
  fetch: CoreFetch;
  digest: CoreDigest;
  createObjectUrl: CoreObjectUrlFactory;
  revokeObjectUrl: CoreObjectUrlRevoker;
}

export function defaultCoreIo(): CoreIo {
  return {
    fetch: (url) => fetch(url),
    digest: async (data) => {
      const buffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
      return toHex(new Uint8Array(buffer));
    },
    createObjectUrl: (bytes, mime) =>
      URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime })),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  };
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Length-independent, constant-time-style digest comparison. These hashes are
 * not secrets, but comparing without early exits costs nothing and keeps the
 * check honest against accidental short-circuit bugs.
 */
export function coreHashEquals(actual: string, expected: string): boolean {
  const a = actual.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Fetches one core artifact as bytes and verifies its SHA-256 BEFORE the
 * bytes are used for anything. Failures are typed player errors (never raw
 * internals); messages name only the artifact, never URLs (D19 redaction).
 */
export async function fetchAndVerifyArtifact(
  url: string,
  artifactName: string,
  expectedSha256Hex: string,
  io: CoreIo,
): Promise<Uint8Array> {
  let response: CoreFetchResponse;
  try {
    response = await io.fetch(url);
  } catch {
    throw new PlaybackError('network-error', `Fetching ${artifactName} failed (network error).`);
  }
  if (!response.ok) {
    throw new PlaybackError('network-error', `Fetching ${artifactName} failed (HTTP ${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = await io.digest(bytes);
  if (!coreHashEquals(actual, expectedSha256Hex)) {
    throw new PlaybackError(
      'conversion-core-integrity',
      `${artifactName} failed its integrity check (SHA-256 mismatch); it was not loaded or executed.`,
      `expected ${expectedSha256Hex.slice(0, 12)}… got ${actual.slice(0, 12)}… (${pinned.version})`,
    );
  }
  return bytes;
}
