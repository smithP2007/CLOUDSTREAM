/**
 * Conversion output profiles for the client-side conversion engine (ffmpeg.wasm).
 *
 * HONESTY SCOPE (D22.3): the pinned @ffmpeg/core@0.12.10 build was verified to
 * carry `--enable-gpl --enable-libx264 --enable-libvpx --enable-libvorbis
 * --enable-libtheora --enable-libopus --enable-libmp3lame --enable-zlib` (read
 * from the binary). Claims below are limited to that table; nothing here
 * promises "every format can be converted".
 */
import type { MediaCapabilities } from '../types';
/** Verified build flags of @ffmpeg/core@0.12.10 (documentation, not runtime claims). */
export declare const FFMPEG_CORE_BUILD_FLAGS: readonly ["--enable-gpl", "--enable-libx264", "--enable-libvpx", "--enable-libvorbis", "--enable-libtheora", "--enable-libopus", "--enable-libmp3lame", "--enable-zlib"];
export interface ConversionProfile {
    readonly id: 'mp4-h264' | 'webm-vp9';
    readonly container: 'mp4' | 'webm';
    readonly ext: string;
    readonly mime: string;
    readonly videoCodec: string;
    readonly audioCodec: string;
    /** Human label for the conversion UI. */
    readonly label: string;
    /** FFmpeg output codec args (input args are composed by the engine). */
    readonly outputArgs: readonly string[];
}
export declare const CONVERSION_PROFILES: {
    readonly mp4: ConversionProfile;
    readonly webm: ConversionProfile;
};
/**
 * Full FFmpeg argument vector for one conversion run. `inputName`/`outputName`
 * are engine-managed virtual file names — never shell command strings (the
 * wasm FFmpeg takes argv directly; there is no shell to inject into).
 */
export declare function conversionArgs(profile: ConversionProfile, inputName: string, outputName: string): string[];
/**
 * Picks the browser-compatible output profile by PROBING the actual browser
 * (never by assuming). MP4/H.264 is preferred (widest support), WebM/VP9 is
 * the fallback; `null` when the browser accepts neither (no conversion offer).
 */
export declare function pickConversionProfile(caps: MediaCapabilities): ConversionProfile | null;
/** Default conversion input bound: 1.5 GiB (wasm32 practical ceiling is ~2 GiB). */
export declare const DEFAULT_MAX_CONVERT_INPUT_BYTES = 1610612736;
//# sourceMappingURL=profiles.d.ts.map