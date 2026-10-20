/**
 * The playback decision flow (owner instruction §7) — pure and testable,
 * independent of React and of any engine implementation.
 *
 * Order of preference for every source:
 *   1. validate the source;
 *   2. classify special requirements (relay-required for header/referer links);
 *   3. attempt native playback when the browser says it can;
 *   4. select the HLS/DASH engine when the source requires one;
 *   5. for unsupported LOCAL files, offer client-side conversion (never automatic);
 *   6. for unsupported REMOTE streams, report the exact limitation;
 *   7. never route anything through a server-side converter (none exists);
 *   8. report a typed, human-readable error when no permitted path exists.
 */
import type { MediaCapabilities, PlaybackLink } from './types';
import type { PlaybackError } from './errors';
import { type Container } from './formatSupport';
import { type ConversionProfile } from './conversion/profiles';
/** Whether client-side conversion may be offered in this environment. */
export interface ConversionAvailability {
    readonly available: boolean;
    /** Present when `available === false` — shown to the user verbatim. */
    readonly unavailableReason?: string;
    readonly maxInputBytes: number;
}
export declare function conversionAvailability(available: boolean, maxInputBytes?: number, unavailableReason?: string): ConversionAvailability;
export type DecisionAction = {
    readonly action: 'native';
    readonly reason: string;
} | {
    readonly action: 'engine';
    readonly engine: 'hls' | 'dash';
    readonly reason: string;
} | {
    readonly action: 'offer-conversion';
    readonly reason: string;
    readonly profile: ConversionProfile;
    readonly maxInputBytes: number;
} | {
    readonly action: 'relay-required';
    readonly reason: string;
} | {
    readonly action: 'unplayable';
    readonly reason: string;
    readonly code: PlaybackError['code'];
};
export interface DecisionContext {
    readonly caps: MediaCapabilities;
    readonly conversion: ConversionAvailability;
}
/** Decision for a provider `PlaybackLink`-shaped source. */
export declare function decideLinkPlayback(link: Pick<PlaybackLink, 'type' | 'url' | 'headers' | 'referer'>, ctx: DecisionContext): DecisionAction;
/** Decision for a local file the user picked (container from head-sniffing). */
export declare function decideLocalPlayback(file: {
    container: Container;
    sizeBytes: number;
    fileName: string;
}, ctx: DecisionContext): DecisionAction;
/** True when a decision is worth an automatic playback attempt. */
export declare function isAttemptable(action: DecisionAction): boolean;
/**
 * Orders candidate indices for bounded fallback: the preferred index first,
 * then every attemptable candidate in list order. The caller enforces the
 * attempt cap — this helper never loops.
 */
export declare function fallbackOrder(decisions: ReadonlyArray<DecisionAction>, preferredIndex: number): number[];
//# sourceMappingURL=playbackDecision.d.ts.map