export type VideoMimeType = "video/mp4";

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

    // A brand header alone is not media. Walk the remaining ISO-BMFF boxes
    // and require a complete media-bearing `moov` or `mdat` box. This catches
    // truncated/placeholder payloads without attempting codec-level parsing.
    let offset = boxSize;
    let hasMediaBox = false;
    while (offset < bytes.length) {
        if (offset + 8 > bytes.length) return null;
        const size =
            bytes[offset] * 0x1000000 +
            bytes[offset + 1] * 0x10000 +
            bytes[offset + 2] * 0x100 +
            bytes[offset + 3];
        const type = String.fromCharCode(
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        );
        if (size === 0) {
            if (
                offset + 8 < bytes.length &&
                (type === "moov" || type === "mdat" || type === "moof")
            ) {
                hasMediaBox = true;
            }
            break;
        }
        if (size < 8 || offset + size > bytes.length) return null;
        if (
            size > 8 &&
            (type === "moov" || type === "mdat" || type === "moof")
        ) {
            hasMediaBox = true;
        }
        offset += size;
    }
    return hasMediaBox ? "video/mp4" : null;
}
