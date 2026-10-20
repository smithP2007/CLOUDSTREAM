/**
 * Native `<video>/<audio>` engine: progressive media (MP4/WebM/Ogg/MOV where
 * the browser reports support, local blob URLs, and native HLS fallback).
 * The engine sets `src` and lets the media element do the work; fatal media
 * errors are classified by the CONTROLLER from the element's error events, so
 * this engine stays minimal and leak-free.
 */
export function createNativeEngine() {
    return {
        id: 'native',
        canPlay(source, _caps) {
            // The decision flow already validated the container/codec probes before
            // choosing `native`; this re-check only guards blob:/http(s) URLs.
            const ok = source.url.startsWith('blob:') || source.url.startsWith('http:');
            return {
                supported: ok,
                reason: ok ? 'Native media element playback.' : 'URL scheme not usable by a media element.',
            };
        },
        async attach(media, source, options) {
            // Autoplay policy is the browser's business; we surface the intent and
            // the element's `play()` rejection maps to a typed error upstream.
            media.src = source.url;
            media.load();
            if (options.autoplay) {
                try {
                    await media.play();
                }
                catch (error) {
                    // Autoplay rejection (NotAllowedError) is a NOTICE, not fatal: the
                    // user can press play. Real decode failures arrive via error events.
                    options.onNotice(error instanceof DOMException && error.name === 'NotAllowedError'
                        ? 'Autoplay was blocked by the browser; press play to start.'
                        : 'Autoplay did not start; press play to try.');
                }
            }
            return {
                engineId: 'native',
                destroy() {
                    media.removeAttribute('src');
                    media.load();
                },
            };
        },
    };
}
//# sourceMappingURL=nativeEngine.js.map