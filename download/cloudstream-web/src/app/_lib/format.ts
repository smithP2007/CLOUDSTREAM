/**
 * Shared formatting helpers (locale-independent, deterministic).
 */

import type { Episode } from '../../core/types';

export function formatDate(epochMs: number | null | undefined): string | null {
  if (epochMs == null || !Number.isFinite(epochMs)) return null;
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export function episodeLabel(episode: Episode): string {
  const parts: string[] = [];
  if (episode.season != null) parts.push(`S${episode.season}`);
  if (episode.episode != null) parts.push(`E${episode.episode}`);
  const prefix = parts.join('·');
  const name = episode.name ?? 'Episode';
  return prefix.length > 0 ? `${prefix} · ${name}` : name;
}
