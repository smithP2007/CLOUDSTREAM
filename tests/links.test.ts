/**
 * Unit tests for the link pipeline (dedupe, quality sort, emission collector).
 * Pins the verified upstream host behaviors: RepoLinkGenerator dedupe + sortUrls
 * (quality descending) semantics, re-implemented clean-room (see docs/decisions.md D14).
 */

import { describe, expect, it } from 'vitest';

import { createLinkCollector, dedupeLinks, dedupeSubtitles, sortLinksByQualityDesc } from '../src/core/links';
import type { PlaybackLink } from '../src/core/types';

import { makeLink, makeSubtitle } from './helpers';

describe('sortLinksByQualityDesc (behavior 5)', () => {
  it('sorts links by quality, highest first', () => {
    const input = [
      makeLink({ url: 'https://cdn/360.mp4', quality: 360 }),
      makeLink({ url: 'https://cdn/1080.mp4', quality: 1080 }),
      makeLink({ url: 'https://cdn/720.mp4', quality: 720 }),
    ];
    const output = sortLinksByQualityDesc(input);
    expect(output.map((l) => l.url)).toEqual([
      'https://cdn/1080.mp4',
      'https://cdn/720.mp4',
      'https://cdn/360.mp4',
    ]);
  });

  it('places unknown quality last and keeps emission order for ties (deterministic, stable)', () => {
    const input = [
      makeLink({ url: 'https://cdn/unknown-1.mp4', quality: null }),
      makeLink({ url: 'https://cdn/720.mp4', quality: 720 }),
      makeLink({ url: 'https://cdn/1080-a.mp4', quality: 1080 }),
      makeLink({ url: 'https://cdn/unknown-2.mp4', quality: null }),
      makeLink({ url: 'https://cdn/1080-b.mp4', quality: 1080 }),
    ];
    const output = sortLinksByQualityDesc(input);
    expect(output.map((l) => l.url)).toEqual([
      // 1080 tie: emission order preserved (stable sort)
      'https://cdn/1080-a.mp4',
      'https://cdn/1080-b.mp4',
      'https://cdn/720.mp4',
      // unknowns last, emission order preserved
      'https://cdn/unknown-1.mp4',
      'https://cdn/unknown-2.mp4',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [makeLink({ url: 'a', quality: 360 }), makeLink({ url: 'b', quality: 1080 })];
    const snapshot = [...input];
    sortLinksByQualityDesc(input);
    expect(input).toEqual(snapshot);
  });
});

describe('dedupeLinks (behavior 4)', () => {
  it('removes duplicate URLs, keeping the first occurrence', () => {
    const first = makeLink({ url: 'https://cdn/same.mp4', quality: 720, name: 'First' });
    const duplicate = makeLink({ url: 'https://cdn/same.mp4', quality: 1080, name: 'Second' });
    const unique = makeLink({ url: 'https://cdn/other.mp4', quality: 1080 });
    const output = dedupeLinks([first, duplicate, unique]);
    expect(output).toHaveLength(2);
    expect(output[0]?.name).toBe('First');
    expect(output.map((l) => l.url)).toEqual(['https://cdn/same.mp4', 'https://cdn/other.mp4']);
  });

  it('treats distinct URLs as distinct even when metadata matches', () => {
    const output = dedupeLinks([
      makeLink({ url: 'https://cdn/a.mp4' }),
      makeLink({ url: 'https://cdn/b.mp4' }),
    ]);
    expect(output).toHaveLength(2);
  });
});

describe('dedupeSubtitles', () => {
  it('removes duplicates per (language, url) pair', () => {
    const output = dedupeSubtitles([
      makeSubtitle({ url: 'https://cdn/sub.vtt', language: 'en' }),
      makeSubtitle({ url: 'https://cdn/sub.vtt', language: 'en' }),
      makeSubtitle({ url: 'https://cdn/sub.vtt', language: 'de' }), // same url, other language → kept
    ]);
    expect(output).toHaveLength(2);
    expect(output.map((s) => s.language)).toEqual(['en', 'de']);
  });
});

describe('createLinkCollector (behavior 7, unit level)', () => {
  it('routes mixed link/subtitle emissions, dedupes and sorts in result()', () => {
    const collector = createLinkCollector();
    const sub = makeSubtitle({ url: 'https://cdn/en.vtt', language: 'en' });

    collector.emit(makeLink({ url: 'https://cdn/720.mp4', quality: 720 }));
    collector.emit(sub);
    collector.emit(makeLink({ url: 'https://cdn/1080.mp4', quality: 1080 }));
    collector.emit({ ...sub }); // duplicate (language, url)
    collector.emit(makeLink({ url: 'https://cdn/720.mp4', quality: 1080 })); // duplicate url → first wins
    collector.setHandled(true);

    const result = collector.result();
    expect(result.handled).toBe(true);
    expect(result.links.map((l) => l.url)).toEqual([
      'https://cdn/1080.mp4',
      'https://cdn/720.mp4',
    ]);
    expect(result.subtitles).toEqual([sub]);
    expect(result.rejectedItems).toBe(0);
  });

  it('counts invalid emissions without throwing into the provider', () => {
    const collector = createLinkCollector();
    expect(() => {
      collector.emit({ name: 'no url here' } as unknown as PlaybackLink);
      collector.emit('total garbage' as unknown as PlaybackLink);
      collector.emit(makeLink({ url: 'https://cdn/ok.mp4', quality: 480 }));
    }).not.toThrow();

    const result = collector.result();
    expect(result.rejectedItems).toBe(2);
    expect(result.links).toHaveLength(1);
  });

  it('drops emissions after close()', () => {
    const collector = createLinkCollector();
    collector.emit(makeLink({ url: 'https://cdn/early.mp4' }));
    collector.close();
    collector.emit(makeLink({ url: 'https://cdn/late.mp4' }));

    const result = collector.result();
    expect(result.links.map((l) => l.url)).toEqual(['https://cdn/early.mp4']);
  });

  it('defaults to handled=false', () => {
    const collector = createLinkCollector();
    expect(collector.result().handled).toBe(false);
  });
});
