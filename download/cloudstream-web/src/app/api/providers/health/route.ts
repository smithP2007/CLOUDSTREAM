/**
 * GET /api/providers/health — serves the health contract that D19 documented
 * as Zod schemas (obs/health.ts). Response is validated against its own
 * schema via `toApiSnapshot(..., true)`. Kill-switch state is reflected in
 * each record's `enabled` flag. Read-only: there is deliberately NO admin
 * mutation surface in this phase (authenticated admin surface is future
 * work; POLICY.md §2, D19).
 */

import { NextResponse } from 'next/server';
import { getRuntime } from '../../../../server/catalog/runtime';
import { toApiSnapshot } from '../../../../server/obs/health';

export async function GET() {
  const runtime = getRuntime();
  const snapshot = toApiSnapshot(runtime.health.snapshot(runtime.killSwitch), true);
  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store' } });
}
