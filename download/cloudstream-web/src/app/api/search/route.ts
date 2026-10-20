/**
 * GET /api/search?q=&page= — typed JSON surface over the catalog search.
 * Errors map to HTTP statuses; the body always matches { ok, data|error }.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { search } from '../../../server/catalog';
import { toCardViews } from '../../../server/catalog/views';
import { MOCK_PROVIDER_ID } from '../../../server/providers/mock';

const ERROR_STATUS: Record<string, number> = {
  'bad-request': 400,
  'not-found': 404,
  'provider-disabled': 503,
  'provider-failure': 502,
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get('q') ?? '').slice(0, 200);
  const pageRaw = params.get('page') ?? '1';
  if (query.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: { kind: 'bad-request', message: 'A search query is required.' } },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(pageRaw)) {
    return NextResponse.json(
      { ok: false, error: { kind: 'bad-request', message: 'Page must be a positive integer.' } },
      { status: 400 },
    );
  }
  const page = Number.parseInt(pageRaw, 10);
  const result = await search(MOCK_PROVIDER_ID, query, page);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: ERROR_STATUS[result.error.kind] ?? 500 });
  }
  return NextResponse.json(
    {
      ok: true,
      data: {
        page,
        hasNext: result.data.hasNext,
        items: toCardViews(result.data.items),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
