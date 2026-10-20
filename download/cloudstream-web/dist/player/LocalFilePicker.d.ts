/**
 * Local file picker: <input type="file"> plus a drag-and-drop zone.
 * Files are handed to the player as File objects (File API + object URLs);
 * they are NEVER uploaded — the player has no upload code path (D21.6).
 */
export interface LocalFilePickerProps {
    onFiles(files: File[]): void;
    /** Accept attribute; defaults to common media containers (HINTS only — the player sniffs). */
    accept?: string;
    disabled?: boolean;
}
export declare function LocalFilePicker({ onFiles, accept, disabled }: LocalFilePickerProps): import("react").JSX.Element;
//# sourceMappingURL=LocalFilePicker.d.ts.map