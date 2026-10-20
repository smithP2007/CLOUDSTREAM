/**
 * Native `<video>/<audio>` engine: progressive media (MP4/WebM/Ogg/MOV where
 * the browser reports support, local blob URLs, and native HLS fallback).
 * The engine sets `src` and lets the media element do the work; fatal media
 * errors are classified by the CONTROLLER from the element's error events, so
 * this engine stays minimal and leak-free.
 */
import type { PlaybackEngine } from '../types';
export declare function createNativeEngine(): PlaybackEngine;
//# sourceMappingURL=nativeEngine.d.ts.map