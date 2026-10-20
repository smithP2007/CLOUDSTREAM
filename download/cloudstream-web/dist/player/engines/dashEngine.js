/**
 * DASH engine via Shaka Player (Apache-2.0) — DYNAMICALLY IMPORTED only when a
 * DASH source plays (D22.1).
 *
 * NOTE (recorded in D22): the package published under the `dash.js` name in the
 * current registry (4.0.1) is NOT the MPEG-DASH player — its typings declare an
 * unrelated React UI kit — so it was REJECTED, and the task-sanctioned
 * alternative (Shaka Player) is used instead. One DASH library per purpose.
 *
 * DASH has no native <video> path, so MSE is a hard requirement (the decision
 * flow reports its absence before attach). DRM-protected manifests are NOT
 * handled (policy D7: no DRM circumvention) — they surface as unsupported.
 *
 * Error mapping (shaka.util.Error.Category): MANIFEST -> manifest-error,
 * NETWORK -> network-error, MEDIA -> decoding-error, DRM -> unsupported;
 * anything else is `unknown`. Fatal errors surface ONCE per session.
 */
import { PlaybackError } from '../errors';
let polyfillsInstalled = false;
/** Default loader: dynamic import — erased from the static graph. */
export const defaultShakaLoader = async () => {
    const mod = (await import('shaka-player'));
    const shaka = mod.default ?? mod;
    if (!polyfillsInstalled && shaka.polyfill) {
        // Recommended once-per-page shaka polyfill installation (EME/MSE gaps).
        try {
            shaka.polyfill.installAll();
        }
        catch {
            /* polyfill failure is non-fatal; MSE check already gated the decision */
        }
        polyfillsInstalled = true;
    }
    return shaka;
};
function classifyShakaError(data, categories) {
    const container = (data ?? {});
    const error = (container.detail ?? data ?? {});
    const category = typeof error.category === 'number' ? error.category : -1;
    if (category === categories.DRM) {
        return new PlaybackError('unsupported-format', 'This stream is DRM-protected; DRM handling is out of scope by project policy (D7).');
    }
    if (category === categories.MANIFEST)
        return new PlaybackError('manifest-error', 'The DASH manifest could not be loaded or parsed.');
    if (category === categories.NETWORK)
        return new PlaybackError('network-error', 'A DASH network request failed.');
    if (category === categories.MEDIA)
        return new PlaybackError('decoding-error', 'The DASH media could not be decoded.');
    return new PlaybackError('unknown', 'DASH playback failed.');
}
export function createDashEngine(options) {
    const loadLibrary = options?.loadLibrary ?? defaultShakaLoader;
    return {
        id: 'dash',
        canPlay(source) {
            return source.kind === 'dash'
                ? { supported: true, reason: 'DASH source with MSE detected by the decision flow.' }
                : { supported: false, reason: 'Source is not DASH.' };
        },
        async attach(media, source, options) {
            let shaka;
            try {
                shaka = await loadLibrary();
            }
            catch (error) {
                throw new PlaybackError('engine-missing', 'The DASH engine (Shaka Player) could not be loaded.', error instanceof Error ? error.message : undefined);
            }
            const player = new shaka.Player(media);
            let settled = false;
            const onError = (data) => {
                if (settled)
                    return;
                settled = true;
                options.onFatal(classifyShakaError(data, shaka.util.Error.Category));
            };
            player.addEventListener('error', onError);
            try {
                await player.load(source.url);
            }
            catch (error) {
                settled = true;
                // Attach failed: the session never started. Clean up and THROW so the
                // controller's catch maps the failure through its fallback chain.
                await player.destroy().catch(() => undefined);
                throw error instanceof PlaybackError
                    ? error
                    : classifyShakaError(error, shaka.util.Error.Category);
            }
            return {
                engineId: 'dash',
                destroy() {
                    settled = true;
                    void player.destroy().catch(() => undefined);
                },
            };
        },
    };
}
//# sourceMappingURL=dashEngine.js.map