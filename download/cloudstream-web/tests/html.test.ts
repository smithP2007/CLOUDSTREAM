import { describe, expect, it } from 'vitest';

import {
  MAX_META_ENTRIES,
  absolutizeUrl,
  extractAllText,
  extractAttribute,
  extractLinks,
  extractMetadata,
  extractText,
  parseHtml,
} from '../src/server/parse';

const PAGE = `<!doctype html>
<html>
  <head>
    <title>  Test Page  </title>
    <meta name="description" content="  A page used in tests  ">
    <meta property="og:title" content="Test OG Title">
    <meta property="og:image" content="https://cdn.example.test/cover.jpg">
    <meta property="og:title" content="IGNORED duplicate">
    <link rel="canonical" href="https://example.test/canonical">
    <script>if (1 > 0) { document.title = 'hijacked'; }</script>
  </head>
  <body>
    <h1>Heading</h1>
    <p class="empty">   </p>
    <a href="https://absolute.example.test/a">Absolute</a>
    <a href="/relative/b">Relative</a>
    <a href="javascript:void(0)">Scripty</a>
    <a href="mailto:someone@example.test">Mail</a>
    <a name="no-href">No href</a>
  </body>
</html>`;

describe('parseHtml', () => {
  it('parses a normal page into a queryable root', () => {
    const parsed = parseHtml(PAGE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(extractText(parsed.root, 'h1')).toBe('Heading');
    }
  });

  it('rejects empty and whitespace-only input', () => {
    expect(parseHtml('')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(parseHtml('   \n\t ')).toMatchObject({ ok: false, error: { kind: 'empty' } });
  });

  it('rejects non-string input', () => {
    expect(parseHtml(undefined as unknown as string)).toMatchObject({
      ok: false,
      error: { kind: 'empty' },
    });
  });

  it('enforces the input size cap', () => {
    const parsed = parseHtml(`x${PAGE}`, { maxBytes: 10 });
    expect(parsed).toMatchObject({
      ok: false,
      error: { kind: 'tooLarge', maxBytes: 10 },
    });
  });
});

describe('text and attribute extraction', () => {
  const root = parseHtml(PAGE);
  if (!root.ok) throw new Error('fixture failed to parse');

  it('trims the first matching text', () => {
    expect(extractText(root.root, 'title')).toBe('Test Page');
  });

  it('returns empty string when nothing matches', () => {
    expect(extractText(root.root, 'nosuchtag')).toBe('');
  });

  it('collects only non-empty trimmed texts in document order', () => {
    // Selector `a` matches every anchor — including the one without href;
    // only extractLinks() is href-scoped.
    expect(extractAllText(root.root, 'a')).toEqual([
      'Absolute',
      'Relative',
      'Scripty',
      'Mail',
      'No href',
    ]);
  });

  it('returns an attribute or null', () => {
    expect(extractAttribute(root.root, 'link[rel="canonical"]', 'href')).toBe(
      'https://example.test/canonical',
    );
    expect(extractAttribute(root.root, 'link[rel="canonical"]', 'nope')).toBeNull();
    expect(extractAttribute(root.root, 'nosuchtag', 'href')).toBeNull();
  });
});

describe('link extraction and absolutization', () => {
  const root = parseHtml(PAGE);
  if (!root.ok) throw new Error('fixture failed to parse');

  it('resolves relative hrefs and keeps http(s) absolutes', () => {
    const links = extractLinks(root.root, 'https://page.example.test/dir/');
    const byHref = new Map(links.map((link) => [link.href, link]));
    expect(byHref.get('https://absolute.example.test/a')?.url).toBe(
      'https://absolute.example.test/a',
    );
    expect(byHref.get('/relative/b')?.url).toBe('https://page.example.test/relative/b');
    expect(byHref.get('/relative/b')?.text).toBe('Relative');
  });

  it('never resolves non-http(s) targets', () => {
    const links = extractLinks(root.root, 'https://page.example.test/');
    const byHref = new Map(links.map((link) => [link.href, link]));
    expect(byHref.get('javascript:void(0)')?.url).toBeNull();
    expect(byHref.get('mailto:someone@example.test')?.url).toBeNull();
    // Raw hrefs are preserved for auditability.
    expect(byHref.get('javascript:void(0)')?.href).toBe('javascript:void(0)');
  });

  it('ignores anchors without href and works without a base URL', () => {
    const withBase = extractLinks(root.root, 'https://page.example.test/');
    expect(withBase.some((link) => link.text === 'No href')).toBe(false);

    const withoutBase = extractLinks(root.root);
    expect(withoutBase.find((l) => l.href === '/relative/b')?.url).toBeNull();
  });

  it('absolutizeUrl is null-safe on both arguments', () => {
    expect(absolutizeUrl('', 'https://x.test/')).toBeNull();
    expect(absolutizeUrl('/a', undefined)).toBeNull();
    expect(absolutizeUrl('/a', '   ')).toBeNull();
    expect(absolutizeUrl('/a', 'not a url at all')).toBeNull();
    expect(absolutizeUrl('ftp://files.test/x', 'https://x.test/')).toBeNull();
  });
});

describe('metadata extraction', () => {
  const root = parseHtml(PAGE);
  if (!root.ok) throw new Error('fixture failed to parse');

  it('extracts title, description, canonical and OpenGraph', () => {
    const meta = extractMetadata(root.root);
    expect(meta.title).toBe('Test Page');
    expect(meta.description).toBe('A page used in tests');
    expect(meta.canonical).toBe('https://example.test/canonical');
    expect(meta.openGraph).toEqual({ title: 'Test OG Title', image: 'https://cdn.example.test/cover.jpg' });
  });

  it('returns an empty-but-well-formed result for a bare document', () => {
    const bare = parseHtml('<html><body></body></html>');
    if (!bare.ok) throw new Error('fixture failed to parse');
    expect(extractMetadata(bare.root)).toEqual({
      title: '',
      description: null,
      canonical: null,
      openGraph: {},
    });
  });

  it('caps OpenGraph capture at MAX_META_ENTRIES (hostile pages stay bounded)', () => {
    const entries = Array.from(
      { length: MAX_META_ENTRIES + 20 },
      (_, i) => `<meta property="og:k${i}" content="v${i}">`,
    ).join('');
    const hostile = parseHtml(`<html><head>${entries}</head></html>`);
    if (!hostile.ok) throw new Error('fixture failed to parse');
    const meta = extractMetadata(hostile.root);
    expect(Object.keys(meta.openGraph).length).toBe(MAX_META_ENTRIES);
  });
});
