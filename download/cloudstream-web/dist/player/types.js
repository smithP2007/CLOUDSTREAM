/**
 * Player value types. The provider contract (`src/core/types.ts`) is reused
 * verbatim — the player introduces NO new media/link vocabulary (D21.3).
 */
/** Convert `SubtitleFile[]` into selectable tracks. */
export function subtitleInputsFromProvider(subtitles) {
    return subtitles.map((sub, i) => ({
        id: `provider-sub-${i}-${sub.url}`,
        label: sub.filename ? `${sub.language} (${sub.filename})` : sub.language,
        language: sub.language,
        url: sub.url,
        filename: sub.filename ?? null,
        origin: 'provider',
    }));
}
/** Convert a `PlaybackLink` into a `PlayerSource` (contract-faithful). */
export function playerSourceFromLink(link, idSuffix) {
    const kind = link.type === 'hls' ? 'hls' : link.type === 'dash' ? 'dash' : 'progressive';
    return {
        id: `link-${idSuffix}-${link.url}`,
        kind,
        url: link.url,
        label: link.quality != null ? `${link.name} · ${link.quality}p` : link.name,
        mimeHint: null,
        localFile: null,
        link,
        sizeBytes: null,
        inspection: null,
    };
}
//# sourceMappingURL=types.js.map