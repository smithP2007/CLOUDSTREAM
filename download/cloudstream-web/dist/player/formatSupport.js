/**
 * Format support: container SNIFFING (signature-based) + runtime browser
 * capability probing. A filename extension is a HINT only — never proof of
 * playability (owner instruction; D21.2). Every playability claim comes from
 * `canPlayType` / `MediaSource` probes executed in the actual browser.
 *
 * All pure logic here is testable in Node without DOM: sniffing operates on
 * bytes, probing delegates to an injected {@link MediaCapabilities}.
 */
function ascii(bytes, start, end) {
    let out = '';
    for (let i = start; i < end && i < bytes.length; i++)
        out += String.fromCharCode(bytes[i] ?? 0);
    return out;
}
const MP4_BRANDS = new Set([
    'isom',
    'iso2',
    'iso3',
    'iso4',
    'iso5',
    'iso6',
    'mp41',
    'mp42',
    'avc1',
    'dash',
    'm4v ',
    'M4V ',
    'M4A ',
    '3gp4',
    '3gp5',
    '3g2a',
]);
/**
 * Identifies a container from its leading bytes (a bounded head slice — the
 * whole file is never read). Unknown signatures stay `unknown`; callers must
 * not guess from extensions alone.
 */
export function detectContainer(bytes) {
    if (bytes.length < 12)
        return 'unknown';
    // ISO-BMFF family: a `ftyp` box must start at offset 4.
    if (ascii(bytes, 4, 8) === 'ftyp') {
        const brand = ascii(bytes, 8, 12);
        if (brand === 'qt  ')
            return 'mov';
        if (MP4_BRANDS.has(brand))
            return 'mp4';
        // Unknown brand inside a well-formed ftyp box: still an ISO-BMFF container.
        return 'mp4';
    }
    // EBML family (Matroska/WebM): distinguish via the DocType element.
    if (bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3) {
        return readEbmlDocType(bytes) === 'webm' ? 'webm' : 'matroska';
    }
    if (ascii(bytes, 0, 4) === 'OggS')
        return 'ogg';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'AVI ')
        return 'avi';
    if (ascii(bytes, 0, 3) === 'FLV')
        return 'flv';
    // MPEG-TS: 0x47 sync bytes at packet boundaries 0 / 188 / 376.
    if (bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47)
        return 'mpegts';
    return 'unknown';
}
/** Reads the EBML header's DocType (0x4282) value, bounded; '' when absent. */
export function readEbmlDocType(bytes) {
    let pos = 4; // after the 0x1A45DFA3 header id
    const headerSize = readEbmlVint(bytes, pos);
    if (headerSize == null)
        return '';
    // The payload (children) starts right after the size vint itself.
    pos += headerSize.byteLength;
    // Walk the first few children of the header looking for DocType.
    for (let guard = 0; guard < 8 && pos + 2 < bytes.length; guard++) {
        const id = readEbmlVint(bytes, pos);
        if (id == null)
            return '';
        pos += id.byteLength;
        const size = readEbmlVint(bytes, pos);
        if (size == null)
            return '';
        pos += size.byteLength;
        // EBML element IDs keep their length-marker bits (unlike sizes): compare
        // the RAW id value so 0x42 0x82 == 0x4282 (DocType).
        const rawId = id.raw;
        if (rawId === 0x4282) {
            const len = Math.min(Number(size.value), 32, bytes.length - pos);
            return ascii(bytes, pos, pos + len);
        }
        pos += Number(size.value);
    }
    return '';
}
/**
 * EBML variable-length integer: first byte's leading-1-bits encode the length.
 * `value` strips the length marker (sizes); `raw` keeps it (element IDs).
 */
function readEbmlVint(bytes, pos) {
    if (pos >= bytes.length)
        return null;
    const first = bytes[pos];
    if (first === undefined || first === 0)
        return null;
    let length = 1;
    let mask = 0x80;
    while (mask > 0 && (first & mask) === 0) {
        mask >>= 1;
        length++;
    }
    if (length > 8 || pos + length > bytes.length)
        return null;
    let value = first & (0xff >> length);
    for (let i = 1; i < length; i++) {
        value = value * 256 + (bytes[pos + i] ?? 0);
    }
    const raw = value + (1 << (7 * length)); // restore the length-marker bit
    return { value, raw, byteLength: length };
}
/* -------------------------------------------------------------------------- */
/* Extension hints (HINT ONLY) and MIME mapping                                */
/* -------------------------------------------------------------------------- */
const EXT_TO_CONTAINER = {
    mp4: 'mp4',
    m4v: 'mp4',
    m4a: 'mp4',
    mov: 'mov',
    webm: 'webm',
    mkv: 'matroska',
    mk3d: 'matroska',
    mka: 'matroska',
    ogv: 'ogg',
    ogg: 'ogg',
    oga: 'ogg',
    avi: 'avi',
    flv: 'flv',
    ts: 'mpegts',
    m2ts: 'mpegts',
    mts: 'mpegts',
};
/** Extension lookup as a HINT for probing order; signatures remain authoritative. */
export function containerFromFilename(name) {
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1)
        return 'unknown';
    const ext = name.slice(dot + 1).toLowerCase();
    return EXT_TO_CONTAINER[ext] ?? 'unknown';
}
const CONTAINER_MIME = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    matroska: 'video/x-matroska',
    ogg: 'video/ogg',
    avi: 'video/x-msvideo',
    flv: 'video/x-flv',
    mpegts: 'video/mp2t',
    unknown: '',
};
export function containerMime(container) {
    return CONTAINER_MIME[container];
}
/* -------------------------------------------------------------------------- */
/* Runtime capability probes                                                   */
/* -------------------------------------------------------------------------- */
/**
 * Canonical probe strings per container (best-known codec pair first). A probe
 * returning '' means THIS browser cannot decode that family — whatever the
 * file extension says.
 */
const CONTAINER_PROBES = {
    mp4: ['video/mp4; codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4; codecs="avc1.42E01E"', 'video/mp4'],
    mov: [
        'video/quicktime; codecs="avc1.42E01E, mp4a.40.2"',
        'video/quicktime',
    ],
    webm: ['video/webm; codecs="vp9, opus"', 'video/webm; codecs="vp8, opus"', 'video/webm'],
    matroska: [
        'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"',
        'video/x-matroska; codecs="vp9, opus"',
        'video/x-matroska',
    ],
    ogg: ['video/ogg; codecs="theora, vorbis"', 'video/ogg'],
    avi: ['video/x-msvideo', 'video/avi', 'video/msvideo'],
    flv: ['video/x-flv'],
    mpegts: ['video/mp2t'],
};
const PROBE_RANK = { '': 0, maybe: 1, probably: 2 };
/**
 * Best `canPlayType` result across the container's canonical probes.
 * '' = this browser reports no native support for the container family.
 */
export function probeNativeContainer(container, caps) {
    const probes = container === 'unknown' ? undefined : CONTAINER_PROBES[container];
    if (!probes)
        return '';
    let best = '';
    for (const probe of probes) {
        const result = caps.canPlayType(probe);
        if (PROBE_RANK[result] > PROBE_RANK[best])
            best = result;
        if (best === 'probably')
            break;
    }
    return best;
}
/** Structural MSE probe: `MediaSource` must exist and accept a baseline type. */
export function detectMseSupport(source = globalThis) {
    const ctor = source.MediaSource;
    // Browsers expose MediaSource as a class; test fakes may use plain objects.
    if (typeof ctor !== 'function' && typeof ctor !== 'object')
        return false;
    const isTypeSupported = ctor.isTypeSupported;
    if (typeof isTypeSupported !== 'function')
        return false;
    try {
        return isTypeSupported.call(ctor, 'video/mp4; codecs="avc1.42E01E"') === true;
    }
    catch {
        return false;
    }
}
/** HLS strategy availability: MSE (hls.js) first, native HLS (Safari) second. */
export function detectHlsSupport(caps) {
    if (caps.hasMse)
        return 'mse';
    return caps.canPlayType('application/vnd.apple.mpegurl') !== '' ? 'native' : 'none';
}
/** DASH has no native `<video>` path in browsers; it requires MSE (dash.js). */
export function detectDashSupport(caps) {
    return caps.hasMse ? 'mse' : 'none';
}
/** Builds capabilities from a real media element (browser runtime). */
export function capabilitiesFromMediaElement(el, source) {
    return {
        hasMse: detectMseSupport(source),
        canPlayType: (mediaType) => el.canPlayType(mediaType),
    };
}
/** Capabilities from an explicit probe function (tests / non-DOM runtimes). */
export function capabilitiesFromProbe(canPlayType, hasMse) {
    return { hasMse, canPlayType };
}
//# sourceMappingURL=formatSupport.js.map