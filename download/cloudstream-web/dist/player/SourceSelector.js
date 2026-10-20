import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SourceSelector({ items, currentIndex, onSelect }) {
    const providerItems = items
        .map((item, index) => ({ item, index }))
        .filter((entry) => entry.item.kind !== 'local-file');
    if (providerItems.length === 0)
        return null;
    return (_jsxs("section", { className: "csw-panel", "aria-label": "Provider sources", children: [_jsx("h3", { className: "csw-panel-title", children: "Sources" }), _jsx("ul", { className: "csw-source-list", role: "listbox", "aria-label": "Select source", children: providerItems.map(({ item, index }) => {
                    const active = index === currentIndex;
                    const broken = item.note === 'needs relay (headers required)' || item.note === 'unplayable here';
                    return (_jsx("li", { children: _jsxs("button", { type: "button", role: "option", "aria-selected": active, className: `csw-source-item${active ? ' is-active' : ''}`, onClick: () => onSelect(index), children: [_jsx("span", { className: "csw-source-badge", children: item.badge }), _jsx("span", { className: "csw-source-name", children: item.label }), broken ? _jsx("span", { className: "csw-source-note", children: item.note }) : null] }) }, item.id));
                }) })] }));
}
//# sourceMappingURL=SourceSelector.js.map