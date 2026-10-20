/**
 * Object-URL lifecycle owner. Every blob URL the player creates is tracked and
 * revoked exactly once — when its source item is removed/replaced or when the
 * controller is disposed (owner instruction: no leaking temporary resources).
 */
/** Real browser registry backed by `URL.createObjectURL/revokeObjectURL`. */
export function createObjectUrlRegistry() {
    const live = new Set();
    return {
        create(blob) {
            const url = URL.createObjectURL(blob);
            live.add(url);
            return url;
        },
        revoke(url) {
            if (!live.has(url))
                return;
            live.delete(url);
            URL.revokeObjectURL(url);
        },
        revokeAll() {
            for (const url of live)
                URL.revokeObjectURL(url);
            live.clear();
        },
        get size() {
            return live.size;
        },
    };
}
//# sourceMappingURL=objectUrls.js.map