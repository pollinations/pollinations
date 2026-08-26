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


export type VideoMimeType =
    | "video/mp4"
    | "video/webm"
    | "video/quicktime";

export function detectVideoMimeType(bytes: Uint8Array): VideoMimeType | null {
    if (bytes.length < 4) return null;
    // Check for common MP4/Video boxes (ftyp, moov, mdat) or WebM EBML header
    const view = new DataView(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 128));
    // MP4: "ftyp" box starts at offset 4
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return "video/mp4";
    }
    // WebM/EBML: starts with 0x1A 0x45 0xDF 0xA3
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return "video/webm";
    }
    // QuickTime/MP4 also sometimes has "moov" box
    if (bytes[4] === 0x6d && bytes[5] === 0x6f && bytes[6] === 0x6f && bytes[7] === 0x76) {
        return "video/mp4";
    }
    return null;
}
