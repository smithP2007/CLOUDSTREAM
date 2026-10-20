import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Local file picker: <input type="file"> plus a drag-and-drop zone.
 * Files are handed to the player as File objects (File API + object URLs);
 * they are NEVER uploaded — the player has no upload code path (D21.6).
 */
import { useCallback, useRef, useState } from 'react';
const DEFAULT_ACCEPT = 'video/*,audio/*,.mkv,.avi,.mov,.webm,.mp4,.ogg,.ts';
export function LocalFilePicker({ onFiles, accept = DEFAULT_ACCEPT, disabled = false }) {
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const emitFiles = useCallback((list) => {
        if (!list || list.length === 0)
            return;
        onFiles(Array.from(list));
    }, [onFiles]);
    return (_jsx("div", { className: `csw-dropzone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`, onDragEnter: (event) => {
            event.preventDefault();
            dragDepth.current += 1;
            if (!disabled)
                setDragging(true);
        }, onDragOver: (event) => event.preventDefault(), onDragLeave: (event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0)
                setDragging(false);
        }, onDrop: (event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (disabled)
                return;
            emitFiles(event.dataTransfer?.files ?? null);
        }, children: _jsxs("label", { className: "csw-dropzone-label", children: [_jsx("input", { type: "file", multiple: true, accept: accept, disabled: disabled, "aria-label": "Add local media files", onChange: (event) => {
                        emitFiles(event.target.files);
                        event.target.value = ''; // allow re-selecting the same file
                    } }), _jsx("span", { className: "csw-dropzone-hint", children: "Choose files or drop them here \u2014 they stay on your device." })] }) }));
}
//# sourceMappingURL=LocalFilePicker.js.map