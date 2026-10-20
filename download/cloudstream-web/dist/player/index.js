/**
 * Public surface of the player subsystem. The provider contract re-exports
 * stay in `src/core`; nothing here registers providers or touches the registry.
 */
export { PlaybackController } from './PlaybackController';
export { MediaPlayer } from './MediaPlayer';
export { LocalFilePicker } from './LocalFilePicker';
export { SourceSelector } from './SourceSelector';
export { SubtitleSelector } from './SubtitleSelector';
export { PlaylistPanel } from './PlaylistPanel';
export { ConversionPanel } from './ConversionPanel';
export { usePlaybackController } from './usePlaybackController';
export { createEngineRegistry, buildDefaultEngineRegistry } from './engines/registry';
export { createNativeEngine } from './engines/nativeEngine';
export { createHlsEngine } from './engines/hlsEngine';
export { createDashEngine } from './engines/dashEngine';
export { detectContainer, containerFromFilename, containerMime, probeNativeContainer, detectMseSupport, detectHlsSupport, detectDashSupport, capabilitiesFromMediaElement, capabilitiesFromProbe, } from './formatSupport';
export { decideLinkPlayback, decideLocalPlayback, fallbackOrder, conversionAvailability, } from './playbackDecision';
export { createConversionEngine, probeConversionEnvironment, DEFAULT_CORE_CDN_BASE, } from './conversion/ffmpegConversion';
export { CONVERSION_PROFILES, conversionArgs, pickConversionProfile, FFMPEG_CORE_BUILD_FLAGS, DEFAULT_MAX_CONVERT_INPUT_BYTES, } from './conversion/profiles';
export { srtToVtt, ensureVtt, looksLikeSrt, looksLikeVtt } from './srtToVtt';
export { createObjectUrlRegistry } from './objectUrls';
export { inspectLocalFile, defaultHeadReader, SNIFF_HEAD_BYTES } from './localMedia';
export { PlaybackError, toPlaybackError } from './errors';
//# sourceMappingURL=index.js.map