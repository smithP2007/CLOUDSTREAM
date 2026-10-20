/**
 * Player format-support tests: container sniffing from signatures (extensions
 * are NEVER proof), capability probes, and MSE/HLS/DASH strategy detection.
 * Pure Node — DOM is injected/faked; no live services.
 */

import { describe, expect, it } from 'vitest';
import {
  containerFromFilename,
  containerMime,
  detectContainer,
  detectDashSupport,
  detectHlsSupport,
  detectMseSupport,
  probeNativeContainer,
  capabilitiesFromMediaElement,
  capabilitiesFromProbe,
} from '../src/player/formatSupport';
import type { MediaCapabilities } from '../src/player/types';

function bytes(...chunks: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const chunk of chunks) {
    if (typeof chunk === 'string') for (const ch of chunk) out.push(ch.charCodeAt(0));
    else out.push(chunk);
  }
  return new Uint8Array(out);
}

/** Builds a valid EBML header (0x1A45DFA3 + DocType child) with the given type. */
function ebml(docType: string): Uint8Array {
  const docTypeBytes = bytes(docType);
  // Child: id 0x4282, size vint = docType length (single-byte sizes suffice here).
  const child = bytes(0x42, 0x82, 0x80 | docTypeBytes.length, ...Array.from(docTypeBytes));
  // Header size vint (single byte, marker + length).
  const headerSize = 0x80 | child.length;
  return bytes(0x1a, 0x45, 0xdf, 0xa3, headerSize, ...Array.from(child));
}

function tsBytes(): Uint8Array {
  const out = new Uint8Array(400);
  out[0] = 0x47;
  out[188] = 0x47;
  out[376] = 0x47;
  return out;
}

describe('container sniffing (signature-based)', () => {
  it('identifies MP4 from an ftyp box with an iso brand', () => {
    expect(detectContainer(bytes(0, 0, 0, 0, 'ftypisom', 0, 0, 0, 0))).toBe('mp4');
    expect(detectContainer(bytes(0, 0, 0, 0, 'ftypavc1', 0, 0, 0, 0))).toBe('mp4');
  });

  it('identifies MOV from the qt brand', () => {
    expect(detectContainer(bytes(0, 0, 0, 0, 'ftypqt  ', 0, 0, 0, 0))).toBe('mov');
  });

  it('identifies an unknown ftyp brand still as ISO-BMFF (mp4 family)', () => {
    expect(detectContainer(bytes(0, 0, 0, 0, 'ftypzz99', 0, 0, 0, 0))).toBe('mp4');
  });

  it('distinguishes WebM from Matroska via the EBML DocType', () => {
    expect(detectContainer(ebml('webm'))).toBe('webm');
    expect(detectContainer(ebml('matroska'))).toBe('matroska');
  });

  it('falls back to matroska for an unknown EBML DocType', () => {
    expect(detectContainer(ebml('exotic'))).toBe('matroska');
  });

  it('identifies Ogg, AVI, FLV and MPEG-TS signatures', () => {
    expect(detectContainer(bytes('OggS', 0, 0, 0, 0, 0, 0, 0, 0))).toBe('ogg');
    expect(detectContainer(bytes('RIFF', 0, 0, 0, 0, 'AVI ', 0, 0))).toBe('avi');
    expect(detectContainer(bytes('FLV', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('flv');
    expect(detectContainer(tsBytes())).toBe('mpegts');
  });

  it('returns unknown for random or truncated data', () => {
    expect(detectContainer(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12))).toBe('unknown');
    expect(detectContainer(bytes('RIFF'))).toBe('unknown'); // too short
    expect(detectContainer(new Uint8Array(0))).toBe('unknown');
  });
});

describe('extension hints and MIME mapping', () => {
  it('maps extensions to containers as a HINT only', () => {
    expect(containerFromFilename('movie.MKV')).toBe('matroska');
    expect(containerFromFilename('clip.webm')).toBe('webm');
    expect(containerFromFilename('no-extension')).toBe('unknown');
    expect(containerFromFilename('trailing.')).toBe('unknown');
  });

  it('maps containers to canonical MIME types', () => {
    expect(containerMime('mp4')).toBe('video/mp4');
    expect(containerMime('matroska')).toBe('video/x-matroska');
    expect(containerMime('unknown')).toBe('');
  });
});

describe('capability probes', () => {
  const capsFrom = (table: Record<string, '' | 'maybe' | 'probably'>, hasMse = false): MediaCapabilities =>
    capabilitiesFromProbe((mime) => table[mime] ?? '', hasMse);

  it('picks the best probe result across the container probe list', () => {
    const caps = capsFrom({ 'video/mp4; codecs="avc1.42E01E"': 'maybe', 'video/mp4': 'probably' });
    expect(probeNativeContainer('mp4', caps)).toBe('probably');
  });

  it('returns "" when the browser reports no support for the family', () => {
    expect(probeNativeContainer('avi', capsFrom({}))).toBe('');
    expect(probeNativeContainer('unknown', capsFrom({ 'video/mp4': 'probably' }))).toBe('');
  });

  it('detects MSE structurally (function + isTypeSupported)', () => {
    const good = { MediaSource: { isTypeSupported: (t: string) => t.includes('avc1') } };
    expect(detectMseSupport(good)).toBe(true);
    expect(detectMseSupport({})).toBe(false);
    expect(detectMseSupport({ MediaSource: {} })).toBe(false);
    expect(detectMseSupport({ MediaSource: { isTypeSupported: () => false } })).toBe(false);
    expect(
      detectMseSupport({
        MediaSource: {
          isTypeSupported: () => {
            throw new Error('boom');
          },
        },
      }),
    ).toBe(false);
  });

  it('routes HLS to mse / native / none', () => {
    expect(detectHlsSupport(capsFrom({}, true))).toBe('mse');
    expect(detectHlsSupport(capsFrom({ 'application/vnd.apple.mpegurl': 'maybe' }, false))).toBe('native');
    expect(detectHlsSupport(capsFrom({}, false))).toBe('none');
  });

  it('routes DASH to mse / none (no native path)', () => {
    expect(detectDashSupport(capsFrom({}, true))).toBe('mse');
    expect(detectDashSupport(capsFrom({}, false))).toBe('none');
  });

  it('builds capabilities from a media element', () => {
    const el = { canPlayType: (mime: string) => (mime === 'video/mp4' ? 'probably' : '') };
    const caps = capabilitiesFromMediaElement(el);
    expect(caps.canPlayType('video/mp4')).toBe('probably');
    expect(caps.canPlayType('video/x-flv')).toBe('');
    expect(caps.hasMse).toBe(false); // Node has no MediaSource
  });
});
