/**
 * Engine registry: strategy-based playback (D21.1). Engines are registered as
 * LAZY factories — hls.js/dash.js only load when such a source actually plays.
 * A missing or failed engine surfaces as a typed `engine-missing` error, never
 * a crash; failed factories are not cached so a transient failure can retry.
 */

import type { EngineFactory, EngineId, EngineRegistry, PlaybackEngine } from '../types';
import { createNativeEngine } from './nativeEngine';

export function createEngineRegistry(): EngineRegistry {
  const factories = new Map<EngineId, EngineFactory>();
  const cache = new Map<EngineId, Promise<PlaybackEngine>>();

  return {
    register(id: EngineId, factory: EngineFactory): void {
      if (cache.has(id)) {
        // Re-registration replaces the engine; drop the stale cache.
        cache.delete(id);
      }
      factories.set(id, factory);
    },
    has(id: EngineId): boolean {
      return factories.has(id);
    },
    get(id: EngineId): Promise<PlaybackEngine> | undefined {
      const factory = factories.get(id);
      if (!factory) return undefined;
      const cached = cache.get(id);
      if (cached) return cached;
      const created = factory().catch((error: unknown) => {
        cache.delete(id); // allow retry after a failed lazy load
        throw error;
      });
      cache.set(id, created);
      return created;
    },
  };
}

/** Default registry: native eager (cheap), hls/dash lazy (heavy, D22.1). */
export function buildDefaultEngineRegistry(): EngineRegistry {
  const registry = createEngineRegistry();
  registry.register('native', async () => createNativeEngine());
  registry.register('hls', async () => {
    const { createHlsEngine } = await import('./hlsEngine');
    return createHlsEngine();
  });
  registry.register('dash', async () => {
    const { createDashEngine } = await import('./dashEngine');
    return createDashEngine();
  });
  return registry;
}
