/**
 * Format support: container SNIFFING (signature-based) + runtime browser
 * capability probing. A filename extension is a HINT only — never proof of
 * playability (owner instruction; D21.2). Every playability claim comes from
 * `canPlayType` / `MediaSource` probes executed in the actual browser.
 *
 * All pure logic here is testable in Node without DOM: sniffing operates on
 * bytes, probing delegates to an injected {@link MediaCapabilities}.
 */
import type { CanPlayResult, MediaCapabilities } from './types';
export type Container = 'mp4' | 'mov' | 'webm' | 'matroska' | 'ogg' | 'avi' | 'flv' | 'mpegts' | 'unknown';
/**
 * Identifies a container from its leading bytes (a bounded head slice — the
 * whole file is never read). Unknown signatures stay `unknown`; callers must
 * not guess from extensions alone.
 */
export declare function detectContainer(bytes: Uint8Array): Container;
/** Reads the EBML header's DocType (0x4282) value, bounded; '' when absent. */
export declare function readEbmlDocType(bytes: Uint8Array): string;
/** Extension lookup as a HINT for probing order; signatures remain authoritative. */
export declare function containerFromFilename(name: string): Container;
export declare function containerMime(container: Container): string;
/**
 * Best `canPlayType` result across the container's canonical probes.
 * '' = this browser reports no native support for the container family.
 */
export declare function probeNativeContainer(container: Container, caps: MediaCapabilities): CanPlayResult;
/** Structural MSE probe: `MediaSource` must exist and accept a baseline type. */
export declare function detectMseSupport(source?: {
    MediaSource?: unknown;
}): boolean;
export type HlsSupport = 'mse' | 'native' | 'none';
/** HLS strategy availability: MSE (hls.js) first, native HLS (Safari) second. */
export declare function detectHlsSupport(caps: MediaCapabilities): HlsSupport;
export type DashSupport = 'mse' | 'none';
/** DASH has no native `<video>` path in browsers; it requires MSE (dash.js). */
export declare function detectDashSupport(caps: MediaCapabilities): DashSupport;
/** Builds capabilities from a real media element (browser runtime). */
export declare function capabilitiesFromMediaElement(el: Pick<HTMLMediaElement, 'canPlayType'>, source?: {
    MediaSource?: unknown;
}): MediaCapabilities;
/** Capabilities from an explicit probe function (tests / non-DOM runtimes). */
export declare function capabilitiesFromProbe(canPlayType: (mediaType: string) => CanPlayResult, hasMse: boolean): MediaCapabilities;
//# sourceMappingURL=formatSupport.d.ts.map