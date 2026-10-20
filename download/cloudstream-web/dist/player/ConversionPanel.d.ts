/**
 * Conversion panel: shown when the decision flow offers client-side conversion
 * for a local file. Owns the conversion RUN (progress/cancel/error UI); the
 * engine itself is injected. "Convert and play" is always an explicit action —
 * conversion never starts automatically (D21.5).
 */
import type { ConversionEngine } from './conversion/ffmpegConversion';
import type { ConversionOfferView } from './types';
export interface ConversionPanelProps {
    offer: ConversionOfferView;
    engine: ConversionEngine | null;
    getInputFile(itemId: string): File | null;
    onResult(blob: Blob, suggestedName: string, convertedFrom: string): Promise<void>;
    onDismiss(): void;
}
export declare function ConversionPanel({ offer, engine, getInputFile, onResult, onDismiss }: ConversionPanelProps): import("react").JSX.Element;
//# sourceMappingURL=ConversionPanel.d.ts.map