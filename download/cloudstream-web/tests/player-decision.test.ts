/**
 * Playback decision flow tests (owner instruction §7): the predictable
 * order of validation -> relay-required -> native -> engine -> conversion
 * offer -> honest failure, plus the bounded fallback ordering.
 */

import { describe, expect, it } from 'vitest';
import {
  conversionAvailability,
  decideLinkPlayback,
  decideLocalPlayback,
  fallbackOrder,
  isAttemptable,
  type DecisionContext,
  type DecisionAction,
} from '../src/player/playbackDecision';
import { capabilitiesFromProbe } from '../src/player/formatSupport';
import type { MediaCapabilities } from '../src/player/types';
import { CONVERSION_PROFILES } from '../src/player/conversion/profiles';

const caps = (table: Record<string, '' | 'maybe' | 'probably'>, hasMse = false): MediaCapabilities =>
  capabilitiesFromProbe((mime) => table[mime] ?? '', hasMse);

const mp4Caps = caps({
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"': 'probably',
  'video/mp4; codecs="avc1.42E01E"': 'probably',
  'video/mp4': 'probably',
});
const webmOnlyCaps = caps({
  'video/webm; codecs="vp9, opus"': 'probably',
  'video/webm': 'probably',
});

function ctx(capsValue: MediaCapabilities, conversion = conversionAvailability(true, 1_000_000)): DecisionContext {
  return { caps: capsValue, conversion };
}

describe('decideLinkPlayback', () => {
  it('rejects malformed or non-http(s) URLs as invalid-source', () => {
    const result = decideLinkPlayback({ type: 'video', url: 'ftp://host/file.mp4' }, ctx(mp4Caps));
    expect(result).toMatchObject({ action: 'unplayable', code: 'invalid-source' });
    expect(decideLinkPlayback({ type: 'video', url: 'not a url' }, ctx(mp4Caps)).action).toBe('unplayable');
    expect(
      decideLinkPlayback({ type: 'video', url: 'javascript:alert(1)' }, ctx(mp4Caps)).action,
    ).toBe('unplayable');
    expect(decideLinkPlayback({ type: 'video', url: 'data:text/html,x' }, ctx(mp4Caps)).action).toBe('unplayable');
  });

  it('accepts same-origin relative paths (resolved by the browser, nothing proxied)', () => {
    expect(
      decideLinkPlayback({ type: 'video', url: '/fixtures/sample-webm.webm' }, ctx(webmOnlyCaps)),
    ).toMatchObject({ action: 'native' });
    expect(
      decideLinkPlayback({ type: 'hls', url: './hls/index.m3u8' }, ctx(caps({}, true))),
    ).toMatchObject({ action: 'engine', engine: 'hls' });
  });

  it('classifies header/referer links as relay-required and never plays them', () => {
    const withHeaders = decideLinkPlayback(
      { type: 'hls', url: 'https://cdn.example/v.m3u8', headers: { Authorization: 'x' } },
      ctx(mp4Caps, conversionAvailability(true)),
    );
    expect(withHeaders).toMatchObject({ action: 'relay-required' });

    const withReferer = decideLinkPlayback(
      { type: 'video', url: 'https://cdn.example/v.mp4', referer: 'https://somewhere.example/' },
      ctx(mp4Caps),
    );
    expect(withReferer).toMatchObject({ action: 'relay-required' });

    // Empty-string referer and empty headers do NOT require the relay.
    const clean = decideLinkPlayback(
      { type: 'video', url: 'https://cdn.example/v.mp4', headers: {}, referer: '' },
      ctx(mp4Caps),
    );
    expect(clean).toMatchObject({ action: 'native' });
  });

  it('selects the hls.js engine under MSE and native HLS without it', () => {
    const link = { type: 'hls' as const, url: 'https://cdn.example/v.m3u8' };
    expect(decideLinkPlayback(link, ctx(caps({}, true)))).toMatchObject({ action: 'engine', engine: 'hls' });
    expect(
      decideLinkPlayback(link, ctx(caps({ 'application/vnd.apple.mpegurl': 'maybe' }, false))),
    ).toMatchObject({ action: 'native' });
    expect(decideLinkPlayback(link, ctx(caps({}, false)))).toMatchObject({
      action: 'unplayable',
      code: 'unsupported-format',
    });
  });

  it('selects dash.js/Shaka under MSE and refuses without it', () => {
    const link = { type: 'dash' as const, url: 'https://cdn.example/v.mpd' };
    expect(decideLinkPlayback(link, ctx(caps({}, true)))).toMatchObject({ action: 'engine', engine: 'dash' });
    expect(decideLinkPlayback(link, ctx(caps({}, false)))).toMatchObject({
      action: 'unplayable',
      code: 'unsupported-format',
    });
  });

  it('attempts native playback for supported progressive URLs and fails early for AVI', () => {
    const mp4 = decideLinkPlayback({ type: 'video', url: 'https://cdn.example/v.mp4' }, ctx(mp4Caps));
    expect(mp4).toMatchObject({ action: 'native' });

    const avi = decideLinkPlayback({ type: 'video', url: 'https://cdn.example/v.avi' }, ctx(mp4Caps));
    expect(avi).toMatchObject({ action: 'unplayable', code: 'unsupported-format' });
    expect(avi.action === 'unplayable' && avi.reason).toContain('not supported');
  });

  it('attempts native playback when the URL extension is unknown (browser validates)', () => {
    const result = decideLinkPlayback({ type: 'video', url: 'https://cdn.example/v' }, ctx(mp4Caps));
    expect(result).toMatchObject({ action: 'native' });
  });
});

describe('decideLocalPlayback', () => {
  const file = {
    container: 'matroska' as const,
    sizeBytes: 500_000,
    fileName: 'movie.mkv',
  };

  it('prefers native playback when the browser probes positively', () => {
    const matroskaCaps = caps({ 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"': 'probably' });
    expect(decideLocalPlayback(file, ctx(matroskaCaps))).toMatchObject({ action: 'native' });
  });

  it('offers conversion (MP4 profile) when unsupported and MP4 output is playable', () => {
    const result = decideLocalPlayback(file, ctx(mp4Caps));
    expect(result).toMatchObject({ action: 'offer-conversion' });
    if (result.action === 'offer-conversion') {
      expect(result.profile.id).toBe('mp4-h264');
      expect(result.maxInputBytes).toBe(1_000_000);
    }
  });

  it('falls back to the WebM profile when only WebM output is playable', () => {
    const result = decideLocalPlayback(file, ctx(webmOnlyCaps));
    expect(result).toMatchObject({ action: 'offer-conversion' });
    if (result.action === 'offer-conversion') expect(result.profile.id).toBe('webm-vp9');
  });

  it('reports unplayable when no conversion output is browser-compatible', () => {
    const result = decideLocalPlayback(file, ctx(caps({})));
    expect(result).toMatchObject({ action: 'unplayable', code: 'unsupported-format' });
  });

  it('reports unplayable when the conversion engine is unavailable', () => {
    const result = decideLocalPlayback(
      file,
      ctx(mp4Caps, conversionAvailability(false, 1_000, 'Web Workers are unavailable.')),
    );
    expect(result).toMatchObject({ action: 'unplayable', code: 'unsupported-format' });
    if (result.action === 'unplayable') expect(result.reason).toContain('Web Workers are unavailable.');
  });

  it('reports unplayable when the file exceeds the conversion input bound', () => {
    const result = decideLocalPlayback(
      { ...file, sizeBytes: 2_000_000 },
      ctx(mp4Caps, conversionAvailability(true, 1_000_000)),
    );
    expect(result).toMatchObject({ action: 'unplayable', code: 'unsupported-format' });
    if (result.action === 'unplayable') expect(result.reason).toContain('exceeds');
  });

  it('offers conversion for AVI locally (unlike remote AVI which cannot convert)', () => {
    const result = decideLocalPlayback(
      { container: 'avi', sizeBytes: 10, fileName: 'c.avi' },
      ctx(mp4Caps),
    );
    expect(result).toMatchObject({ action: 'offer-conversion' });
  });
});

describe('bounded fallback ordering', () => {
  it('returns the preferred index first, then attemptable ones, in order', () => {
    const decisions: DecisionAction[] = [
      { action: 'unplayable', code: 'unsupported-format', reason: '' },
      { action: 'native', reason: '' },
      { action: 'relay-required', reason: '' },
      { action: 'engine', engine: 'hls', reason: '' },
    ];
    expect(fallbackOrder(decisions, 0)).toEqual([0, 1, 3]);
    expect(fallbackOrder(decisions, 1)).toEqual([1, 3]);
    expect(fallbackOrder(decisions, 3)).toEqual([3, 1]);
  });

  it('isAttemptable is true only for native/engine actions', () => {
    expect(isAttemptable({ action: 'native', reason: '' })).toBe(true);
    expect(isAttemptable({ action: 'engine', engine: 'dash', reason: '' })).toBe(true);
    expect(isAttemptable({ action: 'offer-conversion', reason: '', profile: CONVERSION_PROFILES.mp4, maxInputBytes: 1 })).toBe(false);
    expect(isAttemptable({ action: 'relay-required', reason: '' })).toBe(false);
    expect(isAttemptable({ action: 'unplayable', code: 'unsupported-format', reason: '' })).toBe(false);
  });
});
