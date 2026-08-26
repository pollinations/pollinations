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
    return boxSize >= 16 && boxSize <= bytes.length ? "video/mp4" : null;
}
