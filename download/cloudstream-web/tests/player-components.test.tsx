// @vitest-environment jsdom
/**
 * Component tests for the player UI (jsdom + Testing Library). Heavy engines
 * are injected via controllerOptions — no network, no real hls.js/shaka/ffmpeg.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MediaPlayer } from '../src/player/MediaPlayer';
import { LocalFilePicker } from '../src/player/LocalFilePicker';
import { SourceSelector } from '../src/player/SourceSelector';
import { SubtitleSelector } from '../src/player/SubtitleSelector';
import { PlaylistPanel } from '../src/player/PlaylistPanel';
import { ConversionPanel } from '../src/player/ConversionPanel';
import { createEngineRegistry } from '../src/player/engines/registry';
import type { PlaybackEngine } from '../src/player/types';
import type { PlaybackLink } from '../src/core/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------ fakes ---------------------------------- */

function fakeNativeEngine(): PlaybackEngine {
  return {
    id: 'native',
    canPlay: () => ({ supported: true, reason: 'fake' }),
    async attach(media, source) {
      // jsdom media element: mirror the source without touching play().
      media.src = source.url;
      return { engineId: 'native', destroy() {} };
    },
  };
}

function fakeControllerOptions() {
  return {
    engines: (() => {
      const registry = createEngineRegistry();
      registry.register('native', async () => fakeNativeEngine());
      return registry;
    })(),
    autoplay: false,
  } as const;
}

/* ------------------------ LocalFilePicker ------------------------------ */

describe('LocalFilePicker', () => {
  it('hands picked files to onFiles without uploading anything', async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<LocalFilePicker onFiles={onFiles} />);
    const input = screen.getByLabelText('Add local media files') as HTMLInputElement;
    const fileA = new File(['aaa'], 'a.mp4', { type: 'video/mp4' });
    const fileB = new File(['bbb'], 'b.mkv', { type: '' });
    await user.upload(input, [fileA, fileB]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    const files = onFiles.mock.calls[0]?.[0] as File[];
    expect(files.map((f) => f.name)).toEqual(['a.mp4', 'b.mkv']);
    expect(input.value).toBe(''); // reset allows re-selecting the same file
  });
});

/* ------------------------ SourceSelector ------------------------------- */

describe('SourceSelector', () => {
  const items = [
    { id: '1', label: 'HD stream', kind: 'hls' as const, sizeBytes: null, engineId: null, note: null, badge: 'HLS' },
    { id: '2', label: 'Gated stream', kind: 'progressive' as const, sizeBytes: null, engineId: null, note: 'needs relay (headers required)', badge: 'VIDEO' },
  ];

  it('renders provider entries with badges and reports disabled reasons', () => {
    const onSelect = vi.fn();
    render(<SourceSelector items={items} currentIndex={-1} onSelect={onSelect} />);
    expect(screen.getByText('HD stream')).toBeTruthy();
    expect(screen.getByText('needs relay (headers required)')).toBeTruthy();
    fireEvent.click(screen.getByText('Gated stream'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks the active source with aria-selected', () => {
    render(<SourceSelector items={items} currentIndex={0} onSelect={() => undefined} />);
    expect(screen.getByRole('option', { name: /HD stream/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: /Gated stream/ }).getAttribute('aria-selected')).toBe('false');
  });
});

/* ----------------------- SubtitleSelector ------------------------------ */

describe('SubtitleSelector', () => {
  const tracks = [
    { id: 't1', label: 'en (sample.vtt)', language: 'en', origin: 'provider' as const, ready: false },
    { id: 't2', label: 'subs.srt', language: 'local', origin: 'local' as const, ready: true },
  ];

  it('selects tracks and toggles off', () => {
    const onSelect = vi.fn();
    render(<SubtitleSelector tracks={tracks} activeId={null} onSelect={onSelect} onAddFiles={() => undefined} />);
    fireEvent.click(screen.getByText('en (sample.vtt)'));
    expect(onSelect).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('passes local subtitle files upward through the file input', async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    render(<SubtitleSelector tracks={[]} activeId={null} onSelect={() => undefined} onAddFiles={onAddFiles} />);
    const input = screen.getByTestId('csw-subtitle-input') as HTMLInputElement;
    await user.upload(input, [new File(['WEBVTT'], 'subs.vtt', { type: 'text/vtt' })]);
    expect(onAddFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'subs.vtt' })]);
  });
});

/* ------------------------- PlaylistPanel ------------------------------- */

describe('PlaylistPanel', () => {
  const items = [
    { id: 'a', label: 'movie.mp4', kind: 'local-file' as const, sizeBytes: 28108, engineId: 'native' as const, note: null, badge: 'MP4' },
    { id: 'b', label: 'clip.avi', kind: 'local-file' as const, sizeBytes: 68292, engineId: null, note: 'needs conversion -> MP4 (H.264 + AAC)', badge: 'AVI' },
  ];

  it('lists items with size, status, and conversion notes; wires remove/clear', () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(
      <PlaylistPanel items={items} currentIndex={0} onSelect={onSelect} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.getByText('movie.mp4')).toBeTruthy();
    expect(screen.getByText('28 KiB')).toBeTruthy();
    expect(screen.getByText('needs conversion -> MP4 (H.264 + AAC)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Remove clip.avi/ }));
    expect(onRemove).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('listitem', { name: undefined }).getAttribute('aria-current')).toBe('true');
  });
});

/* ------------------------ ConversionPanel ------------------------------ */

describe('ConversionPanel', () => {
  const offer = {
    itemId: 'b',
    profileLabel: 'MP4 (H.264 + AAC)',
    reason: 'The browser reports no native support for AVI (clip.avi).',
    profile: {
      id: 'mp4-h264' as const,
      container: 'mp4' as const,
      ext: 'mp4',
      mime: 'video/mp4',
      videoCodec: 'libx264 (H.264)',
      audioCodec: 'aac',
      label: 'MP4 (H.264 + AAC)',
      outputArgs: [],
    },
  };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('shows availability problems instead of a button', () => {
    render(
      <ConversionPanel
        offer={offer}
        engine={{ availability: { available: false, reason: 'Web Workers are unavailable.' }, convert: async () => ({ blob: new Blob(), outputName: 'o', durationMs: 0 }), dispose() {} }}
        getInputFile={() => null}
        onResult={async () => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/Conversion is unavailable/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Convert and play' })).toBeNull();
  });

  it('runs the engine with progress, delivers the blob, and never auto-starts', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn().mockResolvedValue(undefined);
    const convert = vi.fn(async (_file: Blob, hooks: { onProgress?: (r: number) => void }) => {
      hooks.onProgress?.(0.5);
      return { blob: new Blob([new Uint8Array(4)]), outputName: 'out.mp4', durationMs: 5 };
    });
    render(
      <ConversionPanel
        offer={offer}
        engine={{ availability: { available: true }, convert, dispose() {} }}
        getInputFile={() => new File(['x'], 'clip.avi')}
        onResult={onResult}
        onDismiss={() => undefined}
      />,
    );
    // No conversion until the explicit action (never automatic).
    expect(convert).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Convert and play' }));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(convert).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]?.[2]).toBe('MP4 (H.264 + AAC)');
  });

  it('supports cancellation and shows the cancelled state', async () => {
    const user = userEvent.setup();
    const gate = deferred<never>();
    const convert = vi.fn((_file: Blob, hooks: { signal?: AbortSignal }) => {
      hooks.signal?.addEventListener('abort', () => gate.reject(new Error('aborted')));
      return gate.promise as never as Promise<{ blob: Blob; outputName: string; durationMs: number }>;
    });
    render(
      <ConversionPanel
        offer={offer}
        engine={{ availability: { available: true }, convert, dispose() {} }}
        getInputFile={() => new File(['x'], 'clip.avi')}
        onResult={async () => undefined}
        onDismiss={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Convert and play' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Conversion cancelled.')).toBeTruthy();
  });

  it('reports conversion failures with the typed message', async () => {
    const user = userEvent.setup();
    const convert = vi.fn(async () => {
      throw new Error('FFmpeg exited with code 1.');
    });
    render(
      <ConversionPanel
        offer={offer}
        engine={{ availability: { available: true }, convert, dispose() {} }}
        getInputFile={() => new File(['x'], 'clip.avi')}
        onResult={async () => undefined}
        onDismiss={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Convert and play' }));
    expect(await screen.findByText(/Converting this file failed/)).toBeTruthy();
  });
});

/* -------------------------- MediaPlayer -------------------------------- */

describe('MediaPlayer (integration smoke, fake engines)', () => {
  const links: PlaybackLink[] = [
    { source: 'fixture', name: 'Fixture MP4', url: '/fixtures/sample-mp4.mp4', type: 'video', quality: 180, headers: null, referer: null },
    { source: 'demo', name: 'Gated HLS', url: 'https://x/gated.m3u8', type: 'hls', quality: 1080, headers: { 'X-Auth': '1' }, referer: null },
  ];

  it('renders the video element, provider sources, and the honest relay-required note', async () => {
    render(
      <StrictMode>
        <MediaPlayer
          links={links}
          controllerOptions={fakeControllerOptions()}
          showLocalPicker={false}
        />
      </StrictMode>,
    );
    expect(screen.getByTestId('csw-video')).toBeTruthy();
    expect(screen.getByText('Fixture MP4 · 180p')).toBeTruthy();
    // StrictMode remounts must not duplicate playlist entries.
    await waitFor(() => expect(screen.getAllByText('Fixture MP4 · 180p').length).toBe(1));
    expect(screen.getByText(/Gated HLS · 1080p/)).toBeTruthy();
  });

  it('adds a local file through the picker and lists it in the playlist', async () => {
    const user = userEvent.setup();
    render(<MediaPlayer controllerOptions={fakeControllerOptions()} />);
    const input = screen.getByLabelText('Add local media files') as HTMLInputElement;
    const head = new Uint8Array(32);
    'ftypisom'.split('').forEach((ch, i) => (head[i + 4] = ch.charCodeAt(0)));
    await user.upload(input, [new File([head], 'local.mp4', { type: '' })]);
    await waitFor(() => expect(screen.getByText('local.mp4')).toBeTruthy());
    expect(screen.getByText('MP4')).toBeTruthy();
  });
});
