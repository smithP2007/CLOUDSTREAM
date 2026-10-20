import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Conversion panel: shown when the decision flow offers client-side conversion
 * for a local file. Owns the conversion RUN (progress/cancel/error UI); the
 * engine itself is injected. "Convert and play" is always an explicit action —
 * conversion never starts automatically (D21.5).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toPlaybackError } from './errors';
export function ConversionPanel({ offer, engine, getInputFile, onResult, onDismiss }) {
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    const busy = progress !== null;
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);
    const convert = useCallback(async () => {
        if (!engine || busy)
            return;
        const file = getInputFile(offer.itemId);
        if (!file) {
            setError('The original file is no longer available.');
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setError(null);
        setProgress(0);
        try {
            const result = await engine.convert(file, {
                profile: offer.profile,
                inputName: file.name,
                signal: controller.signal,
                onProgress: (ratio) => setProgress(ratio),
            });
            const base = file.name.replace(/\.[^.]+$/, '');
            await onResult(result.blob, `${base}.${offer.profile.ext}`, offer.profileLabel);
        }
        catch (caught) {
            const playbackError = toPlaybackError(caught, 'conversion-failed');
            if (playbackError.code === 'aborted')
                setError('Conversion cancelled.');
            else
                setError(playbackError.message);
        }
        finally {
            abortRef.current = null;
            setProgress(null);
        }
    }, [busy, engine, getInputFile, offer, onResult]);
    const cancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);
    const unavailable = engine != null && !engine.availability.available;
    return (_jsxs("section", { className: "csw-panel csw-conversion", "aria-label": "Convert to play", children: [_jsx("h3", { className: "csw-panel-title", children: "Convert and play" }), _jsx("p", { className: "csw-conversion-reason", children: offer.reason }), _jsxs("p", { className: "csw-conversion-plan", children: ["Output: ", _jsx("strong", { children: offer.profileLabel }), " (runs entirely on your device; the original file is kept)."] }), unavailable ? (_jsxs("p", { className: "csw-conversion-error", role: "alert", children: ["Conversion is unavailable in this browser: ", engine?.availability.reason] })) : (_jsxs("div", { className: "csw-conversion-actions", children: [_jsx("button", { type: "button", className: "csw-btn csw-btn-primary", onClick: () => void convert(), disabled: busy, children: "Convert and play" }), busy ? (_jsx("button", { type: "button", className: "csw-btn", onClick: cancel, children: "Cancel" })) : null, _jsx("button", { type: "button", className: "csw-btn csw-btn-ghost", onClick: onDismiss, disabled: busy, children: "Dismiss" })] })), busy ? (_jsxs("div", { className: "csw-conversion-progress", role: "progressbar", "aria-valuenow": Math.round((progress ?? 0) * 100), "aria-valuemin": 0, "aria-valuemax": 100, children: [_jsx("div", { className: "csw-conversion-bar", style: { width: `${Math.round((progress ?? 0) * 100)}%` } }), _jsxs("span", { className: "csw-conversion-progress-label", children: [Math.round((progress ?? 0) * 100), "%"] })] })) : null, error ? (_jsx("p", { className: "csw-conversion-error", role: "alert", children: error })) : null] }));
}
//# sourceMappingURL=ConversionPanel.js.map