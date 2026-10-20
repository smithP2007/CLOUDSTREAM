/**
 * Barrel for the Internet Archive provider (D20). Registration: ONLY by the
 * app runtime (`src/server/catalog/runtime.ts`) and tests — the library never
 * auto-registers providers. See ./provider.ts for the D20 authorization and
 * the enforced scope conditions.
 */
export { createInternetArchiveProvider, IA_PROVIDER_ID, IA_PROVIDER_NAME, IA_MAIN_URL, IA_USER_AGENT, IA_COLLECTION_POOLS } from './provider';
export type { InternetArchiveProviderDeps } from './provider';
export {
  parseIaYear,
  stripIaHtml,
  parseIaRuntimeMinutes,
  selectIaDerivative,
  buildIaDownloadUrl,
  identifierFromDetailsUrl,
  iaSubtitleFromFileName,
} from './provider';
export * from './schemas';
export { IA_RIGHTS_REGISTER, isApprovedIdentifier, getRightsEntry } from './register';
export type { IaRightsRegisterEntry } from './register';
export { IaPacer, IaRateLimitedError, IA_MIN_REQUEST_SPACING_MS, IA_MAX_IN_FLIGHT, IA_MIN_429_PAUSE_MS, IA_MAX_429_PAUSE_MS } from './pacer';
