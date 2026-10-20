/**
 * Object-URL lifecycle owner. Every blob URL the player creates is tracked and
 * revoked exactly once — when its source item is removed/replaced or when the
 * controller is disposed (owner instruction: no leaking temporary resources).
 */

import type { ObjectUrlRegistry } from './types';

/** Real browser registry backed by `URL.createObjectURL/revokeObjectURL`. */
export function createObjectUrlRegistry(): ObjectUrlRegistry {
  const live = new Set<string>();
  return {
    create(blob: Blob): string {
      const url = URL.createObjectURL(blob);
      live.add(url);
      return url;
    },
    revoke(url: string): void {
      if (!live.has(url)) return;
      live.delete(url);
      URL.revokeObjectURL(url);
    },
    revokeAll(): void {
      for (const url of live) URL.revokeObjectURL(url);
      live.clear();
    },
    get size(): number {
      return live.size;
    },
  };
}
