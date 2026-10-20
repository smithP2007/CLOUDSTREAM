/**
 * Object-URL lifecycle owner. Every blob URL the player creates is tracked and
 * revoked exactly once — when its source item is removed/replaced or when the
 * controller is disposed (owner instruction: no leaking temporary resources).
 */
import type { ObjectUrlRegistry } from './types';
/** Real browser registry backed by `URL.createObjectURL/revokeObjectURL`. */
export declare function createObjectUrlRegistry(): ObjectUrlRegistry;
//# sourceMappingURL=objectUrls.d.ts.map