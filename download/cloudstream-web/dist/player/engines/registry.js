/**
 * Engine registry: strategy-based playback (D21.1). Engines are registered as
 * LAZY factories — hls.js/dash.js only load when such a source actually plays.
 * A missing or failed engine surfaces as a typed `engine-missing` error, never
 * a crash; failed factories are not cached so a transient failure can retry.
 */
import { createNativeEngine } from './nativeEngine';
export function createEngineRegistry() {
    const factories = new Map();
    const cache = new Map();
    return {
        register(id, factory) {
            if (cache.has(id)) {
                // Re-registration replaces the engine; drop the stale cache.
                cache.delete(id);
            }
            factories.set(id, factory);
        },
        has(id) {
            return factories.has(id);
        },
        get(id) {
            const factory = factories.get(id);
            if (!factory)
                return undefined;
            const cached = cache.get(id);
            if (cached)
                return cached;
            const created = factory().catch((error) => {
                cache.delete(id); // allow retry after a failed lazy load
                throw error;
            });
            cache.set(id, created);
            return created;
        },
    };
}
/** Default registry: native eager (cheap), hls/dash lazy (heavy, D22.1). */
export function buildDefaultEngineRegistry() {
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
//# sourceMappingURL=registry.js.map