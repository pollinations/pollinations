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
