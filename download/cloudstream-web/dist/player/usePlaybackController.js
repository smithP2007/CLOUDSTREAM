/**
 * React binding for the headless {@link PlaybackController}: one controller
 * instance per component lifetime, snapshot state via useSyncExternalStore,
 * and dispose-on-unmount. React NEVER owns playback state (D21.1).
 *
 * StrictMode note (documented in docs/media-compatibility.md): React's
 * mount->cleanup->mount simulation disposes the instance and re-runs effects
 * WITHOUT an intervening render, so a strictly-correct "dispose on cleanup"
 * hook must also swap the instance when the render body observes disposal.
 * The dev-only demo page runs without StrictMode; the Phase 5 app shell must
 * make (and record) its own StrictMode decision when integrating this hook.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { PlaybackController } from './PlaybackController';
export function usePlaybackController(args = {}) {
    const { controllerOptions, links, subtitles } = args;
    const controllerRef = useRef(null);
    if (controllerRef.current === null || controllerRef.current.isDisposed) {
        // A StrictMode cleanup disposed the previous instance; swap in a fresh
        // one so the component stays fully functional (state repopulates below).
        controllerRef.current = new PlaybackController(controllerOptions);
    }
    const controller = controllerRef.current;
    useEffect(() => {
        return () => {
            controller.dispose();
        };
    }, [controller]);
    useEffect(() => {
        controller.setProviderLinks(links ?? []);
    }, [controller, links]);
    useEffect(() => {
        controller.setProviderSubtitles(subtitles ?? []);
    }, [controller, subtitles]);
    const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
    const actions = useMemo(() => ({
        play: () => controller.play(),
        pause: () => controller.pause(),
        togglePlay: () => controller.togglePlay(),
        seek: (seconds) => controller.seek(seconds),
        seekBy: (delta) => controller.seekBy(delta),
        setVolume: (volume) => controller.setVolume(volume),
        toggleMute: () => controller.toggleMute(),
        setRate: (rate) => controller.setRate(rate),
        playIndex: (index) => controller.playIndex(index),
        next: () => controller.next(),
        previous: () => controller.previous(),
        removeItem: (itemId) => controller.removeItem(itemId),
        clearPlaylist: () => controller.clearPlaylist(),
        setSubtitle: (trackId) => controller.setSubtitle(trackId),
        addLocalFiles: (files) => controller.addLocalFiles(files),
        addSubtitleFiles: (files) => controller.addSubtitleFiles(files),
    }), [controller]);
    return { controller, state, actions };
}
//# sourceMappingURL=usePlaybackController.js.map