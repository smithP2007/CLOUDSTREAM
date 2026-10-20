/**
 * Engine registry: strategy-based playback (D21.1). Engines are registered as
 * LAZY factories — hls.js/dash.js only load when such a source actually plays.
 * A missing or failed engine surfaces as a typed `engine-missing` error, never
 * a crash; failed factories are not cached so a transient failure can retry.
 */
import type { EngineRegistry } from '../types';
export declare function createEngineRegistry(): EngineRegistry;
/** Default registry: native eager (cheap), hls/dash lazy (heavy, D22.1). */
export declare function buildDefaultEngineRegistry(): EngineRegistry;
//# sourceMappingURL=registry.d.ts.map