/**
 * Conversion output profiles for the client-side conversion engine (ffmpeg.wasm).
 *
 * HONESTY SCOPE (D22.3): the pinned @ffmpeg/core@0.12.10 build was verified to
 * carry `--enable-gpl --enable-libx264 --enable-libvpx --enable-libvorbis
 * --enable-libtheora --enable-libopus --enable-libmp3lame --enable-zlib` (read
 * from the binary). Claims below are limited to that table; nothing here
 * promises "every format can be converted".
 */

import type { CanPlayResult, MediaCapabilities } from '../types';

/** Verified build flags of @ffmpeg/core@0.12.10 (documentation, not runtime claims). */
export const FFMPEG_CORE_BUILD_FLAGS = [
  '--enable-gpl',
  '--enable-libx264',
  '--enable-libvpx',
  '--enable-libvorbis',
  '--enable-libtheora',
  '--enable-libopus',
  '--enable-libmp3lame',
  '--enable-zlib',
] as const;

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

const MP4_PROFILE: ConversionProfile = {
  id: 'mp4-h264',
  container: 'mp4',
  ext: 'mp4',
  mime: 'video/mp4',
  videoCodec: 'libx264 (H.264)',
  audioCodec: 'aac',
  label: 'MP4 (H.264 + AAC)',
  outputArgs: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart'],
};

const WEBM_PROFILE: ConversionProfile = {
  id: 'webm-vp9',
  container: 'webm',
  ext: 'webm',
  mime: 'video/webm',
  videoCodec: 'libvpx-vp9 (VP9)',
  audioCodec: 'libopus (Opus)',
  label: 'WebM (VP9 + Opus)',
  outputArgs: ['-c:v', 'libvpx-vp9', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '128k'],
};

export const CONVERSION_PROFILES = {
  mp4: MP4_PROFILE,
  webm: WEBM_PROFILE,
} as const;

/**
 * Full FFmpeg argument vector for one conversion run. `inputName`/`outputName`
 * are engine-managed virtual file names — never shell command strings (the
 * wasm FFmpeg takes argv directly; there is no shell to inject into).
 */
export function conversionArgs(profile: ConversionProfile, inputName: string, outputName: string): string[] {
  return ['-i', inputName, ...profile.outputArgs, '-y', outputName];
}

/**
 * Picks the browser-compatible output profile by PROBING the actual browser
 * (never by assuming). MP4/H.264 is preferred (widest support), WebM/VP9 is
 * the fallback; `null` when the browser accepts neither (no conversion offer).
 */
export function pickConversionProfile(caps: MediaCapabilities): ConversionProfile | null {
  const probe = (profile: ConversionProfile, codecs: string): CanPlayResult =>
    caps.canPlayType(`${profile.mime}; codecs="${codecs}"`);
  if (probe(MP4_PROFILE, 'avc1.42E01E, mp4a.40.2') !== '') return MP4_PROFILE;
  if (probe(WEBM_PROFILE, 'vp9, opus') !== '') return WEBM_PROFILE;
  if (caps.canPlayType(MP4_PROFILE.mime) !== '') return MP4_PROFILE;
  if (caps.canPlayType(WEBM_PROFILE.mime) !== '') return WEBM_PROFILE;
  return null;
}

/** Default conversion input bound: 1.5 GiB (wasm32 practical ceiling is ~2 GiB). */
export const DEFAULT_MAX_CONVERT_INPUT_BYTES = 1_610_612_736;
