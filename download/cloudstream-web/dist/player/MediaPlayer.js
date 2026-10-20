import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * MediaPlayer — the polished player surface (owner instruction §8).
 *
 * Composition: video stage + full transport controls + keyboard navigation +
 * provider source selector + subtitle selector + playlist + local picker +
 * conversion panel. All playback state lives in the headless controller;
 * this component only renders snapshots and forwards intents (D21.1).
 *
 * Error states are explicit (loading / buffering / unsupported / network /
 * relay-required); there is no silent failure and no auto-transcode.
 */
import { useCallback, useEffect, useRef } from 'react';
import { usePlaybackController } from './usePlaybackController';
import { LocalFilePicker } from './LocalFilePicker';
import { SourceSelector } from './SourceSelector';
import { SubtitleSelector } from './SubtitleSelector';
import { PlaylistPanel } from './PlaylistPanel';
import { ConversionPanel } from './ConversionPanel';
import { createConversionEngine } from './conversion/ffmpegConversion';
import './player.css';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
export function MediaPlayer({ links, subtitles, showLocalPicker = true, controllerOptions, conversionCoreBaseUrl, className, ariaLabel = 'Media player', }) {
    const { controller, state, actions } = usePlaybackController({ controllerOptions, links, subtitles });
    const stageRef = useRef(null);
    const engineRef = useRef(null);
    if (engineRef.current === null) {
        engineRef.current = createConversionEngine(conversionCoreBaseUrl ? { coreBaseUrl: conversionCoreBaseUrl } : {});
    }
    const attachMedia = useCallback((el) => {
        controller.attachElement(el);
    }, [controller]);
    const toggleFullscreen = useCallback(async () => {
        const stage = stageRef.current;
        if (!stage)
            return;
        try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await stage.requestFullscreen();
        }
        catch {
            /* fullscreen unsupported/refused — non-fatal, ignore */
        }
    }, []);
    const onKeyDown = useCallback((event) => {
        const target = event.target;
        if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName))
            return;
        switch (event.key) {
            case ' ':
            case 'k':
            case 'K':
                event.preventDefault();
                actions.togglePlay();
                break;
            case 'ArrowRight':
                event.preventDefault();
                actions.seekBy(5);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                actions.seekBy(-5);
                break;
            case 'ArrowUp':
                event.preventDefault();
                actions.setVolume(Math.min(1, state.volume + 0.1));
                break;
            case 'ArrowDown':
                event.preventDefault();
                actions.setVolume(Math.max(0, state.volume - 0.1));
                break;
            case 'm':
            case 'M':
                event.preventDefault();
                actions.toggleMute();
                break;
            case 'f':
            case 'F':
                event.preventDefault();
                void toggleFullscreen();
                break;
            case 'n':
            case 'N':
                event.preventDefault();
                void actions.next();
                break;
            case 'p':
            case 'P':
                event.preventDefault();
                void actions.previous();
                break;
            default:
                break;
        }
    }, [actions, state.volume, toggleFullscreen]);
    // Keep the aria-live region informative without spamming.
    useEffect(() => {
        /* state changes re-render; no side effect needed */
    }, [state.status]);
    const showSourceSelector = state.items.some((item) => item.kind !== 'local-file');
    return (_jsxs("div", { className: `csw-player${className ? ` ${className}` : ''}`, onKeyDown: onKeyDown, "data-testid": "csw-player", children: [_jsxs("div", { className: "csw-stage", ref: stageRef, children: [_jsx("video", { ref: attachMedia, className: "csw-video", playsInline: true, preload: "metadata", "aria-label": ariaLabel, "data-testid": "csw-video" }), state.status === 'loading' || state.status === 'buffering' ? (_jsxs("div", { className: "csw-overlay", "aria-live": "polite", "aria-busy": "true", children: [_jsx("span", { className: "csw-spinner", "aria-hidden": "true" }), _jsx("span", { children: state.status === 'loading' ? 'Loading…' : 'Buffering…' })] })) : null, state.status === 'error' && state.error ? (_jsxs("div", { className: "csw-overlay csw-overlay-error", role: "alert", "aria-live": "assertive", children: [_jsx("strong", { children: state.error.message }), _jsxs("span", { className: "csw-error-code", children: ["code: ", state.error.code] }), state.error.code === 'relay-required' ? (_jsx("span", { className: "csw-error-hint", children: "Playback of header-gated sources requires the future authenticated media relay (decision D8 scope)." })) : null, _jsxs("div", { className: "csw-overlay-actions", children: [state.currentIndex + 1 < state.items.length ? (_jsx("button", { type: "button", className: "csw-btn", onClick: () => void actions.playIndex(state.currentIndex + 1), children: "Next source" })) : null, _jsx("button", { type: "button", className: "csw-btn", onClick: () => actions.play(), children: "Retry" })] })] })) : null, state.notice ? (_jsx("div", { className: "csw-notice", role: "status", children: state.notice })) : null] }), _jsxs("div", { className: "csw-controls", children: [_jsx("button", { type: "button", className: "csw-btn csw-btn-primary", onClick: actions.togglePlay, "aria-label": state.status === 'playing' ? 'Pause' : 'Play', children: state.status === 'playing' ? '❚❚' : '▶' }), _jsxs("span", { className: "csw-time", children: [_jsx("span", { "aria-label": "Current time", children: formatTime(state.currentTimeSec) }), ' / ', _jsx("span", { "aria-label": "Duration", children: formatTime(state.durationSec) })] }), _jsx("input", { className: "csw-seek", type: "range", min: 0, max: Math.max(state.durationSec, 0.1), step: 0.1, value: Math.min(state.currentTimeSec, state.durationSec || 0), "aria-label": "Seek", onChange: (event) => actions.seek(Number(event.target.value)) }), _jsx("button", { type: "button", className: "csw-btn", onClick: actions.toggleMute, "aria-label": state.muted ? 'Unmute' : 'Mute', "aria-pressed": state.muted, children: state.muted ? '🔇' : '🔊' }), _jsx("input", { className: "csw-volume", type: "range", min: 0, max: 1, step: 0.05, value: state.muted ? 0 : state.volume, "aria-label": "Volume", onChange: (event) => actions.setVolume(Number(event.target.value)) }), _jsxs("label", { className: "csw-rate", children: [_jsx("span", { className: "csw-visually-hidden", children: "Playback speed" }), _jsx("select", { value: String(state.rate), "aria-label": "Playback speed", onChange: (event) => actions.setRate(Number(event.target.value)), children: SPEEDS.map((speed) => (_jsxs("option", { value: speed, children: [speed, "\u00D7"] }, speed))) })] }), _jsx("button", { type: "button", className: "csw-btn", onClick: () => void actions.previous(), "aria-label": "Previous item", children: "\u23EE" }), _jsx("button", { type: "button", className: "csw-btn", onClick: () => void actions.next(), "aria-label": "Next item", children: "\u23ED" }), _jsx("button", { type: "button", className: "csw-btn", onClick: () => void toggleFullscreen(), "aria-label": "Toggle fullscreen", children: "\u26F6" })] }), state.lastDecision ? (_jsxs("p", { className: "csw-decision", title: "How this source is being played", children: [_jsx("strong", { children: "Playback mode:" }), " ", state.lastDecision] })) : null, state.conversionOffer && engineRef.current ? (_jsx(ConversionPanel, { offer: state.conversionOffer, engine: engineRef.current, getInputFile: (itemId) => controller.getLocalFile(itemId), onResult: (blob, name, convertedFrom) => controller.addLocalBlob(blob, name, convertedFrom), onDismiss: () => controller.clearConversionOffer() })) : null, _jsxs("div", { className: "csw-side", children: [showSourceSelector ? (_jsx(SourceSelector, { items: state.items, currentIndex: state.currentIndex, onSelect: (index) => void actions.playIndex(index) })) : null, _jsx(SubtitleSelector, { tracks: state.subtitles, activeId: state.activeSubtitleId, onSelect: (id) => void actions.setSubtitle(id), onAddFiles: (files) => void actions.addSubtitleFiles(files) }), _jsx(PlaylistPanel, { items: state.items, currentIndex: state.currentIndex, onSelect: (index) => void actions.playIndex(index), onRemove: actions.removeItem, onClear: actions.clearPlaylist }), showLocalPicker ? (_jsx("section", { className: "csw-panel", "aria-label": "Add local media", children: _jsx(LocalFilePicker, { onFiles: (files) => void actions.addLocalFiles(files) }) })) : null] })] }));
}
//# sourceMappingURL=MediaPlayer.js.map