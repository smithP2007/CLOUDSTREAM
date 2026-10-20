/**
 * SRT -> WebVTT conversion tests: pure text transforms on untrusted subtitle
 * content; cue text is copied verbatim (never rendered as HTML by us).
 */

import { describe, expect, it } from 'vitest';
import { ensureVtt, filenameHintsSrt, looksLikeSrt, looksLikeVtt, srtToVtt } from '../src/player/srtToVtt';
import { PlaybackError } from '../src/player/errors';

const SRT = [
  '1',
  '00:00:00,000 --> 00:00:00,700',
  'Hello cue one.',
  '',
  '2',
  '00:00:00,700 --> 00:00:01,400',
  'Cue two with <i>markup-looking</i> text.',
].join('\n');

describe('format detection', () => {
  it('recognizes WebVTT by its header (BOM tolerated)', () => {
    expect(looksLikeVtt('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi')).toBe(true);
    expect(looksLikeVtt('\uFEFFWEBVTT')).toBe(true);
    expect(looksLikeVtt('1\n00:00:00,000 --> ...')).toBe(false);
  });

  it('recognizes SubRip by comma timestamps', () => {
    expect(looksLikeSrt(SRT)).toBe(true);
    expect(looksLikeSrt('WEBVTT\n00:00:00.000 --> 00:00:01.000')).toBe(false);
  });

  it('treats filenames as hints only', () => {
    expect(filenameHintsSrt('subs.srt')).toBe(true);
    expect(filenameHintsSrt('subs.SRT')).toBe(true);
    expect(filenameHintsSrt('subs.vtt')).toBe(false);
  });
});

describe('srtToVtt', () => {
  it('converts timestamps, drops numbering, and prepends the header', () => {
    const vtt = srtToVtt(SRT);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:00,700'.replace(',', '.'));
    expect(vtt).toContain('00:00:00.700 --> 00:00:01.400');
    expect(vtt).not.toMatch(/^\s*1\s*$/m);
    expect(vtt).toContain('Hello cue one.');
    expect(vtt).toContain('Cue two with <i>markup-looking</i> text.');
  });

  it('normalizes CRLF input and strips the BOM', () => {
    const vtt = srtToVtt('\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nLine\r\n');
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
    expect(vtt).toContain('Line');
  });

  it('keeps cue text lines verbatim across blank separators', () => {
    const vtt = srtToVtt(SRT);
    const lines = vtt.split('\n');
    expect(lines).toContain('Hello cue one.');
    expect(lines[lines.indexOf('Hello cue one.') - 1]).toContain('-->');
  });
});

describe('ensureVtt', () => {
  it('passes WebVTT through unchanged', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi';
    expect(ensureVtt(vtt, 'track.vtt')).toBe(vtt);
  });

  it('converts SubRip input', () => {
    const vtt = ensureVtt(SRT, 'track.srt');
    expect(vtt.startsWith('WEBVTT')).toBe(true);
  });

  it('fails with a typed error for unrelated text', () => {
    try {
      ensureVtt('just some random text without timings', 'track.txt');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PlaybackError);
      expect((error as PlaybackError).code).toBe('unsupported-format');
      expect((error as PlaybackError).message).toContain('track.txt');
    }
  });
});
