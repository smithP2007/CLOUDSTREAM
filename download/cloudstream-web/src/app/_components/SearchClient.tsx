'use client';

/**
 * Search UI (roadmap Phase 5 route 2): form-driven query + explicit page
 * state in the URL, with loading, empty, error and pagination states.
 * Results come from /api/search (server-side provider call through the
 * catalog layer); nothing here talks to providers directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PosterCard } from './PosterCard';
import { ErrorPanel } from './ErrorPanel';
import { EmptyState } from './EmptyState';
import type { CatalogCardView } from '../../server/catalog/views';

/** Minimal provider descriptor passed in from the server wrapper. */
export interface SearchProviderOption {
  readonly id: string;
  readonly name: string;
}

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SearchViewState {
  readonly status: SearchStatus;
  readonly items: readonly CatalogCardView[];
  readonly hasNext: boolean;
  readonly message: string | null;
}

const IDLE: SearchViewState = { status: 'idle', items: [], hasNext: false, message: null };

export function SearchClient({ providers }: { providers: readonly SearchProviderOption[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlQuery = searchParams.get('q') ?? '';
  const urlPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const urlProvider = providers.some((p) => p.id === (searchParams.get('provider') ?? ''))
    ? (searchParams.get('provider') as string)
    : (providers[0]?.id ?? '');

  const [inputValue, setInputValue] = useState(urlQuery);
  const [view, setView] = useState<SearchViewState>(IDLE);
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setInputValue(urlQuery);
  }, [urlQuery]);

  const runSearch = useCallback(
    async (query: string, page: number, provider: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setView((current) => ({ ...current, status: 'loading' }));
      try {
        const params = new URLSearchParams({ q: query, page: String(page) });
        if (provider !== '') params.set('provider', provider);
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const payload: unknown = await response.json();
        if (!response.ok || typeof payload !== 'object' || payload === null || !('ok' in payload)) {
          const message =
            typeof payload === 'object' && payload !== null && 'error' in payload
              ? String((payload as { error?: { message?: unknown } }).error?.message ?? 'The search failed.')
              : 'The search failed.';
          setView({ status: 'error', items: [], hasNext: false, message });
          return;
        }
        const data = (payload as { ok: true; data: { items: CatalogCardView[]; hasNext: boolean } }).data;
        setView({ status: 'ready', items: data.items, hasNext: data.hasNext, message: null });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setView({
          status: 'error',
          items: [],
          hasNext: false,
          message: 'The search request failed (network error).',
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (urlQuery.trim().length === 0) {
      setView(IDLE);
      return;
    }
    void runSearch(urlQuery, urlPage, urlProvider);
    return () => {
      abortRef.current?.abort();
    };
  }, [urlQuery, urlPage, urlProvider, runSearch]);

  // Move focus to the results heading after query/page changes (a11y).
  const lastNavKey = useRef(`${urlQuery}:${urlPage}`);
  useEffect(() => {
    const key = `${urlQuery}:${urlPage}`;
    if (lastNavKey.current !== key) {
      lastNavKey.current = key;
      resultsHeadingRef.current?.focus();
    }
  }, [urlQuery, urlPage]);

  const pushParams = useCallback(
    (query: string, page: number, provider: string) => {
      const params = new URLSearchParams();
      if (query.trim().length > 0) params.set('q', query.trim());
      if (page > 1) params.set('page', String(page));
      if (provider !== '' && providers[0]?.id !== provider) params.set('provider', provider);
      const qs = params.toString();
      router.push(qs.length > 0 ? `/search?${qs}` : '/search');
    },
    [router, providers],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushParams(inputValue, 1, urlProvider);
  };

  const goToPage = (page: number) => {
    pushParams(urlQuery, page, urlProvider);
  };

  const onProviderChange = (provider: string) => {
    if (urlQuery.trim().length > 0) pushParams(urlQuery, 1, provider);
  };

  return (
    <>
      <h1 style={{ marginBottom: 0 }}>Search</h1>
      <p style={{ color: 'var(--csw-muted)', marginTop: 4 }}>
        Fixture catalog or the Internet Archive public-domain provider (D20).
      </p>
      <form className="search-form" role="search" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="search-input">
          Search titles
        </label>
        <input
          id="search-input"
          className="input"
          type="search"
          name="q"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Titles, tags, types…"
          maxLength={200}
          autoComplete="off"
          data-testid="search-input"
        />
        <label className="sr-only" htmlFor="search-provider">
          Content source
        </label>
        <select
          id="search-provider"
          className="input"
          value={urlProvider}
          onChange={(event) => onProviderChange(event.target.value)}
          data-testid="search-provider"
          style={{ maxWidth: 220 }}
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" data-testid="search-submit">
          Search
        </button>
      </form>

      {view.status === 'idle' ? (
        <EmptyState title="Search the fixture catalog" testId="search-idle">
          <p>Type a query above — for example “documentary”, “anime”, or “aurora”.</p>
        </EmptyState>
      ) : null}

      {view.status === 'loading' ? (
        <div aria-busy="true" aria-label="Searching" data-testid="search-loading">
          <div className="skeleton skeleton-line w-60" />
          <div className="poster-grid" style={{ marginTop: 12 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div className="skeleton skeleton-poster" key={i} />
            ))}
          </div>
        </div>
      ) : null}

      {view.status === 'error' ? (
        <ErrorPanel title="Search failed" message={view.message ?? 'The search failed.'} testId="search-error" />
      ) : null}

      {view.status === 'ready' ? (
        <section aria-label="Search results">
          <h2 ref={resultsHeadingRef} tabIndex={-1} style={{ outline: 'none' }}>
            Results
          </h2>
          <p className="sr-only" role="status">
            {view.items.length} results {view.hasNext ? 'and more pages available' : ''}
          </p>
          {view.items.length === 0 ? (
            <EmptyState title={`No results for “${urlQuery}”`} testId="search-empty">
              <p>Try a shorter query, or browse the catalog from the home page.</p>
            </EmptyState>
          ) : (
            <>
              <div className="poster-grid" data-testid="search-results">
                {view.items.map(({ item, href }) => (
                  <PosterCard
                    key={`${item.providerName}:${item.url}`}
                    href={href}
                    name={item.name}
                    posterUrl={item.posterUrl ?? null}
                    type={item.type}
                    quality={item.quality}
                    score={item.score}
                  />
                ))}
              </div>
              <nav className="pagination" aria-label="Search result pages">
                <button
                  type="button"
                  className="btn"
                  onClick={() => goToPage(urlPage - 1)}
                  disabled={urlPage <= 1}
                  data-testid="search-prev"
                >
                  ← Previous
                </button>
                <span className="pagination-status">Page {urlPage}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => goToPage(urlPage + 1)}
                  disabled={!view.hasNext}
                  data-testid="search-next"
                >
                  Next →
                </button>
              </nav>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
