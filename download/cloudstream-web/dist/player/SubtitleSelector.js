import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SubtitleSelector({ tracks, activeId, onSelect, onAddFiles }) {
    if (tracks.length === 0 && !onAddFiles)
        return null;
    return (_jsxs("section", { className: "csw-panel", "aria-label": "Subtitles", children: [_jsx("h3", { className: "csw-panel-title", children: "Subtitles" }), tracks.length > 0 ? (_jsxs("div", { className: "csw-sub-list", role: "radiogroup", "aria-label": "Subtitle track", children: [_jsx("button", { type: "button", role: "radio", "aria-checked": activeId === null, className: `csw-sub-item${activeId === null ? ' is-active' : ''}`, onClick: () => onSelect(null), children: "Off" }), tracks.map((track) => (_jsxs("button", { type: "button", role: "radio", "aria-checked": activeId === track.id, className: `csw-sub-item${activeId === track.id ? ' is-active' : ''}`, title: track.ready ? undefined : 'Will be loaded when selected', onClick: () => onSelect(track.id), children: [track.label, _jsx("span", { className: "csw-sub-origin", children: track.origin })] }, track.id)))] })) : null, onAddFiles ? (_jsxs("label", { className: "csw-sub-add", children: [_jsx("input", { type: "file", accept: ".vtt,.srt,text/vtt,application/x-subrip", multiple: true, "aria-label": "Add local subtitle files (VTT or SRT)", "data-testid": "csw-subtitle-input", onChange: (event) => {
                            const files = event.target.files;
                            if (files && files.length > 0)
                                onAddFiles(Array.from(files));
                            event.target.value = '';
                        } }), _jsx("span", { className: "csw-dropzone-hint", children: "Add .vtt / .srt from your device" })] })) : null] }));
}
//# sourceMappingURL=SubtitleSelector.js.map