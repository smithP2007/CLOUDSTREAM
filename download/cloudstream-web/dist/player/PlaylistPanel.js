import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function formatSize(bytes) {
    if (bytes == null || !Number.isFinite(bytes) || bytes <= 0)
        return '';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
export function PlaylistPanel({ items, currentIndex, onSelect, onRemove, onClear }) {
    if (items.length === 0)
        return null;
    return (_jsxs("section", { className: "csw-panel", "aria-label": "Playlist", children: [_jsxs("div", { className: "csw-panel-head", children: [_jsx("h3", { className: "csw-panel-title", children: "Playlist" }), _jsx("button", { type: "button", className: "csw-btn csw-btn-ghost", onClick: onClear, children: "Clear all" })] }), _jsx("ol", { className: "csw-playlist", children: items.map((item, index) => {
                    const active = index === currentIndex;
                    const size = formatSize(item.sizeBytes);
                    return (_jsxs("li", { className: `csw-playlist-item${active ? ' is-active' : ''}`, "aria-current": active ? 'true' : undefined, children: [_jsxs("button", { type: "button", className: "csw-playlist-main", onClick: () => onSelect(index), children: [_jsx("span", { className: "csw-source-badge", children: item.badge }), _jsx("span", { className: "csw-playlist-name", title: item.label, children: item.label }), size ? _jsx("span", { className: "csw-playlist-size", children: size }) : null, item.engineId ? _jsx("span", { className: "csw-playlist-status", children: item.engineId }) : null, item.note ? _jsx("span", { className: "csw-playlist-note", children: item.note }) : null] }), _jsx("button", { type: "button", className: "csw-btn csw-btn-ghost csw-playlist-remove", "aria-label": `Remove ${item.label} from playlist`, onClick: () => onRemove(item.id), children: "\u2715" })] }, item.id));
                }) })] }));
}
//# sourceMappingURL=PlaylistPanel.js.map