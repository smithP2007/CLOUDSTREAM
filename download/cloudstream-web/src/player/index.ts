/**
 * Public surface of the player subsystem. The provider contract re-exports
 * stay in `src/core`; nothing here registers providers or touches the registry.
 */

export { PlaybackController } from './PlaybackController';
export { MediaPlayer, type MediaPlayerProps } from './MediaPlayer';
export { LocalFilePicker, type LocalFilePickerProps } from './LocalFilePicker';
export { SourceSelector, type SourceSelectorProps } from './SourceSelector';
export { SubtitleSelector, type SubtitleSelectorProps } from './SubtitleSelector';
export { PlaylistPanel, type PlaylistPanelProps } from './PlaylistPanel';
export { ConversionPanel, type ConversionPanelProps } from './ConversionPanel';
export { usePlaybackController, type UsePlaybackControllerArgs, type UsePlaybackControllerResult, type MediaPlayerActions } from './usePlaybackController';
export { createEngineRegistry, buildDefaultEngineRegistry } from './engines/registry';
export { createNativeEngine } from './engines/nativeEngine';
export { createHlsEngine, type HlsLibraryLoader } from './engines/hlsEngine';
export { createDashEngine, type ShakaLibraryLoader } from './engines/dashEngine';
export {
  detectContainer,
  containerFromFilename,
  containerMime,
  probeNativeContainer,
  detectMseSupport,
  detectHlsSupport,
  detectDashSupport,
  capabilitiesFromMediaElement,
  capabilitiesFromProbe,
  type Container,
} from './formatSupport';
export {
  decideLinkPlayback,
  decideLocalPlayback,
  fallbackOrder,
  conversionAvailability,
  type DecisionAction,
  type DecisionContext,
  type ConversionAvailability,
} from './playbackDecision';
export {
  createConversionEngine,
  probeConversionEnvironment,
  DEFAULT_CORE_CDN_BASE,
  type ConversionEngine,
  type ConversionResult,
} from './conversion/ffmpegConversion';
export {
  CONVERSION_PROFILES,
  conversionArgs,
  pickConversionProfile,
  FFMPEG_CORE_BUILD_FLAGS,
  DEFAULT_MAX_CONVERT_INPUT_BYTES,
  type ConversionProfile,
} from './conversion/profiles';
export { srtToVtt, ensureVtt, looksLikeSrt, looksLikeVtt } from './srtToVtt';
export { createObjectUrlRegistry } from './objectUrls';
export { inspectLocalFile, defaultHeadReader, SNIFF_HEAD_BYTES } from './localMedia';
export { PlaybackError, toPlaybackError, type PlaybackErrorCode } from './errors';
export type {
  EngineId,
  CanPlayResult,
  MediaCapabilities,
  SourceKind,
  PlayerSource,
  LocalFileInspection,
  SubtitleTrackInput,
  SubtitleTrackView,
  PlaylistItemView,
  PlaybackStatus,
  PlaybackErrorView,
  PlaybackState,
  ConversionOfferView,
  EngineAttachOptions,
  EngineSession,
  PlaybackEngine,
  EngineFactory,
  EngineRegistry,
  PlaybackControllerOptions,
  ObjectUrlRegistry,
} from './types';
