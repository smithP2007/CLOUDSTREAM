// @vitest-environment jsdom
/**
 * Phase 5 app component tests (jsdom + Testing Library). next/navigation is
 * mocked (jsdom has no App Router context); fetch is stubbed for the search
 * client. No network, no real provider calls.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => {
  const push = vi.fn();
  const refresh = vi.fn();
  return {
    useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams('q=aurora'),
  };
});

import { PosterCard } from '../src/app/_components/PosterCard';
import { EpisodeNav } from '../src/app/_components/EpisodeNav';
import { ErrorPanel } from '../src/app/_components/ErrorPanel';
import { FavoriteButton } from '../src/app/_components/FavoriteButton';
import { SearchClient } from '../src/app/_components/SearchClient';
import type { Episode } from '../src/core/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('PosterCard', () => {
  it('renders the link, badges, score, and a fallback poster when none exists', () => {
    render(
      <PosterCard
        href="/title/mock-fixtures/abc"
        name="Aurora Drift"
        posterUrl={null}
        type="Movie"
        quality="FullHD"
        score={8.1}
        year={2021}
      />,
    );
    const link = screen.getByTestId('poster-card');
    expect(link.getAttribute('href')).toBe('/title/mock-fixtures/abc');
    expect(link.textContent).toContain('Aurora Drift');
    expect(link.textContent).toContain('FullHD');
    expect(link.textContent).toContain('★ 8.1');
    const img = link.querySelector('img');
    expect(img?.getAttribute('src')).toContain('data:image/svg+xml');
    expect(img?.getAttribute('alt')).toBe('Aurora Drift poster');
  });
});

describe('EpisodeNav', () => {
  const episodes: Episode[] = [
    {
      data: 'fixtures:episode:northgate/s1e1',
      name: 'Episode 1',
      season: 1,
      episode: 1,
      date: Date.UTC(2022, 2, 6),
      runTime: 45,
      description: null,
      posterUrl: null,
      score: null,
    },
    {
      data: 'fixtures:episode:northgate/s1e2',
      name: 'Episode 2',
      season: 1,
      episode: 2,
      date: Date.UTC(2022, 2, 13),
      runTime: 46,
      description: null,
      posterUrl: null,
      score: null,
    },
  ];

  it('renders watch links and marks the active episode', () => {
    render(
      <EpisodeNav
        providerId="mock-fixtures"
        titleUrl="https://fixtures.local/title/northgate"
        episodes={episodes}
        activeData="fixtures:episode:northgate/s1e2"
      />,
    );
    const links = screen.getAllByTestId('episode-link');
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toContain('/watch/mock-fixtures/');
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.getAttribute('aria-current')).toBeNull();
    expect(items[1]?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('S1·E1 · Episode 1')).toBeTruthy();
  });
});

describe('ErrorPanel', () => {
  it('renders the typed message and retries via router.refresh', async () => {
    const user = userEvent.setup();
    render(<ErrorPanel title="Could not load" message="The provider returned no home rows for this page." />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const { useRouter } = await import('next/navigation');
    expect(vi.mocked(useRouter().refresh)).toHaveBeenCalled();
  });
});

describe('FavoriteButton', () => {
  it('toggles membership in the local library', async () => {
    const user = userEvent.setup();
    const ref = {
      providerId: 'mock-fixtures',
      url: 'https://fixtures.local/title/glasswing',
      name: 'Glasswing',
      posterUrl: '/posters/glasswing.svg',
      type: 'Movie',
    };
    render(<FavoriteButton ref_={ref} />);
    const button = screen.getByTestId('favorite-button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('In your library');
    expect(window.localStorage.getItem('csw.library.v1')).toContain('glasswing');
  });
});

describe('SearchClient', () => {
  const apiPayload = {
    ok: true,
    data: {
      page: 1,
      hasNext: false,
      items: [
        {
          item: {
            name: 'Aurora Drift',
            url: 'https://fixtures.local/title/aurora-drift',
            providerName: 'Mock Fixtures',
            type: 'Movie',
            posterUrl: '/posters/aurora-drift.svg',
            quality: 'FullHD',
            score: 8.1,
            id: 'aurora-drift',
          },
          href: '/title/mock-fixtures/abc',
        },
      ],
    },
  };

  it('fetches results for the URL query and renders cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiPayload), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByTestId('search-results')).toBeTruthy(), { timeout: 5_000 });
    expect(screen.getByTestId('poster-card').textContent).toContain('Aurora Drift');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/search?q=aurora'), expect.anything());
    expect(screen.getByTestId('search-next')).toHaveProperty('disabled', true);
  });

  it('shows the empty state for zero results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { page: 1, hasNext: false, items: [] } }), { status: 200 }),
      ),
    );
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy(), { timeout: 5_000 });
  });

  it('shows the typed error state when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, error: { kind: 'provider-failure', message: 'provider exploded' } }),
          { status: 502 },
        ),
      ),
    );
    render(<SearchClient />);
    await waitFor(() => expect(screen.getByTestId('search-error')).toBeTruthy(), { timeout: 5_000 });
    expect(screen.getByTestId('search-error').textContent).toContain('provider exploded');
  });
});
