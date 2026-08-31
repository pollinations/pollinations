export type VideoMimeType = "video/mp4";

const MP4_BRANDS = new Set([
    "3gp4",
    "3gp5",
    "3gp6",
    "M4V ",
    "M4VP",
    "MSNV",
    "avc1",
    "dash",
    "iso2",
    "iso3",
    "iso4",
    "iso5",
    "iso6",
    "isom",
    "mp41",
    "mp42",
]);

function boxType(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    );
}

/** Detect the MP4 container returned by Pollinations video routes. */
export function detectVideoMimeType(bytes: Uint8Array): VideoMimeType | null {
    // ISO base media files (MP4 and compatible brands) start with a box size,
    // followed by the `ftyp` box marker.
    if (bytes.length < 16) return null;
    if (
        bytes[4] !== 0x66 ||
        bytes[5] !== 0x74 ||
        bytes[6] !== 0x79 ||
        bytes[7] !== 0x70
    ) {
        return null;
    }

    const boxSize =
        bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3];
    // An ftyp box contains its header, major brand, and minor version. A
    // truncated or oversized first box is not a valid MP4 payload.
    if (boxSize < 16 || boxSize > bytes.length) return null;
    const brands = [boxType(bytes, 8)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
        brands.push(boxType(bytes, offset));
    }
    if (!brands.some((brand) => MP4_BRANDS.has(brand))) return null;

    // A playable MP4 needs initialization metadata and media data. Requiring
    // both also rejects other ISO-BMFF formats such as AVIF/HEIF.
    let offset = boxSize;
    let hasMovieMetadata = false;
    let hasMediaData = false;
    while (offset < bytes.length) {
        if (offset + 8 > bytes.length) return null;
        const size =
            bytes[offset] * 0x1000000 +
            bytes[offset + 1] * 0x10000 +
            bytes[offset + 2] * 0x100 +
            bytes[offset + 3];
        const type = boxType(bytes, offset + 4);
        if (size === 0) {
            if (offset + 8 < bytes.length && type === "mdat") {
                hasMediaData = true;
            }
            break;
        }
        if (size < 8 || offset + size > bytes.length) return null;
        if (size > 8 && type === "moov") hasMovieMetadata = true;
        if (size > 8 && type === "mdat") hasMediaData = true;
        offset += size;
    }
    return hasMovieMetadata && hasMediaData ? "video/mp4" : null;
}
