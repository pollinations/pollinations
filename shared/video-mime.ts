export type VideoMimeType = "video/mp4" | "video/webm" | "video/quicktime";

export function detectVideoMimeType(bytes: Uint8Array): VideoMimeType | null {
    // MP4 / MOV share the ftyp box at offset 4.
    if (
        bytes.length >= 12 &&
        bytes[4] === 0x66 /* f */ &&
        bytes[5] === 0x74 /* t */
    ) {
        const brand = String.fromCharCode(
            bytes[8],
            bytes[9],
            bytes[10],
            bytes[11],
        );
        if (
            brand === "isom" ||
            brand === "mp42" ||
            brand === "avc1" ||
            brand === "qt  "
        ) {
            return brand === "qt  " ? "video/quicktime" : "video/mp4";
        }
    }
    // WebM / Matroska EBML header.
    if (
        bytes.length >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
    ) {
        return "video/webm";
    }
    return null;
}
