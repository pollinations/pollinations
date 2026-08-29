export type ImageMimeType =
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif"
    | "image/bmp";

export function detectImageMimeType(bytes: Uint8Array): ImageMimeType | null {
    if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
    ) {
        return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "image/webp";
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return "image/gif";
    }
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
    return null;
}

export type VideoMimeType = "video/mp4" | "video/webm";

export function detectVideoMimeType(bytes: Uint8Array): VideoMimeType | null {
    // MP4-family files (mp4, mov, m4v) are ISO base media files: the first box
    // is a size header followed by a brand at offset 4, usually "ftyp".
    if (bytes.length >= 12) {
        const brand = String.fromCharCode(
            bytes[4] ?? 0,
            bytes[5] ?? 0,
            bytes[6] ?? 0,
            bytes[7] ?? 0,
        );
        if (brand === "ftyp" || brand === "moov" || brand === "mdat") {
            return "video/mp4";
        }
    }
    // WebM and MKV share the EBML header 0x1A45DFA3.
    if (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
    ) {
        return "video/webm";
    }
    return null;
}
