import {
    InvalidImageStructureError,
    stripImageMetadata,
} from "@shared/image-strip.ts";
import { describe, expect, it } from "vitest";

// ── Helpers ──────────────────────────────────────────────────────────────

const ICC_PROFILE_ID = [
    0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
];

function jpegClean(): Uint8Array {
    // SOI + SOF0 (1×1) + SOS + EOI — no metadata segments
    return new Uint8Array([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
        0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
    ]);
}

function jpegWithExif(): Uint8Array {
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe1,
        0x00,
        0x06,
        0x45,
        0x78,
        0x69,
        0x66, // APP1 EXIF
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

function jpegWithIptcAndComment(): Uint8Array {
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xed,
        0x00,
        0x04,
        0x00,
        0x00, // APP13 IPTC
        0xff,
        0xfe,
        0x00,
        0x05,
        0x48,
        0x65,
        0x6c, // COM "Hel"
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

function jpegWithFillBytes(): Uint8Array {
    // Two 0xFF fill bytes before the APP1 marker
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xff,
        0xff,
        0xe1,
        0x00,
        0x04,
        0x00,
        0x00, // fill + APP1
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

function jpegWithIccProfile(): Uint8Array {
    const payload = [...ICC_PROFILE_ID, 0x01, 0x01]; // header + seq + total
    const segLen = 2 + payload.length;
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe2,
        (segLen >> 8) & 0xff,
        segLen & 0xff,
        ...payload,
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

function jpegWithIccAndExif(): Uint8Array {
    const iccPayload = [...ICC_PROFILE_ID, 0x01, 0x01];
    const iccLen = 2 + iccPayload.length;
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe2,
        (iccLen >> 8) & 0xff,
        iccLen & 0xff,
        ...iccPayload, // APP2 ICC (keep)
        0xff,
        0xe1,
        0x00,
        0x04,
        0x00,
        0x00, // APP1 EXIF (strip)
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

function jpegWithNonIccApp2(): Uint8Array {
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe2,
        0x00,
        0x06,
        0x46,
        0x50,
        0x58,
        0x52, // APP2 FPXR (strip)
        0xff,
        0xda,
        0x00,
        0x03,
        0x00,
        0xff,
        0xd9,
    ]);
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngChunk(name: string, data: number[]): number[] {
    const len = data.length;
    const n = name.split("").map((c) => c.charCodeAt(0));
    return [
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
        ...n,
        ...data,
        0x00,
        0x00,
        0x00,
        0x00, // CRC placeholder
    ];
}

function pngClean(): Uint8Array {
    return new Uint8Array([
        ...PNG_SIG,
        ...pngChunk("IHDR", new Array(13).fill(0)),
        ...pngChunk("IDAT", [0x08, 0xd7]),
        ...pngChunk("IEND", []),
    ]);
}

function pngWithText(): Uint8Array {
    return new Uint8Array([
        ...PNG_SIG,
        ...pngChunk("IHDR", new Array(13).fill(0)),
        ...pngChunk("tEXt", [0x41, 0x00, 0x42]),
        ...pngChunk("IDAT", [0x08, 0xd7]),
        ...pngChunk("IEND", []),
    ]);
}

function pngWithExif(): Uint8Array {
    return new Uint8Array([
        ...PNG_SIG,
        ...pngChunk("IHDR", new Array(13).fill(0)),
        ...pngChunk("eXIf", [0x4d, 0x4d, 0x00, 0x2a]),
        ...pngChunk("IDAT", [0x08, 0xd7]),
        ...pngChunk("IEND", []),
    ]);
}

function webpClean(): Uint8Array {
    const vp8 = new Array(10).fill(0);
    const fileSize = 4 + 8 + vp8.length;
    return new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46,
        fileSize & 0xff,
        (fileSize >> 8) & 0xff,
        (fileSize >> 16) & 0xff,
        (fileSize >> 24) & 0xff,
        0x57,
        0x45,
        0x42,
        0x50,
        0x56,
        0x50,
        0x38,
        0x20,
        vp8.length & 0xff,
        (vp8.length >> 8) & 0xff,
        0x00,
        0x00,
        ...vp8,
    ]);
}

function webpWithExif(): Uint8Array {
    const vp8 = new Array(10).fill(0);
    const exif = [0x45, 0x78, 0x69, 0x66];
    const fileSize = 4 + 8 + vp8.length + 8 + exif.length;
    return new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46,
        fileSize & 0xff,
        (fileSize >> 8) & 0xff,
        (fileSize >> 16) & 0xff,
        (fileSize >> 24) & 0xff,
        0x57,
        0x45,
        0x42,
        0x50,
        0x56,
        0x50,
        0x38,
        0x20,
        vp8.length & 0xff,
        (vp8.length >> 8) & 0xff,
        0x00,
        0x00,
        ...vp8,
        0x45,
        0x58,
        0x49,
        0x46,
        exif.length & 0xff,
        (exif.length >> 8) & 0xff,
        0x00,
        0x00,
        ...exif,
    ]);
}

// ── JPEG ─────────────────────────────────────────────────────────────────

describe("stripImageMetadata — JPEG", () => {
    it("returns original reference for a clean JPEG", () => {
        const input = jpegClean();
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("strips APP1 (EXIF)", () => {
        const result = stripImageMetadata(jpegWithExif());
        expect(result).not.toBe(jpegWithExif());
        // SOI + SOS-to-end only
        expect([...result]).toEqual([
            0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
        ]);
    });

    it("strips APP13 (IPTC) and COM together", () => {
        const result = stripImageMetadata(jpegWithIptcAndComment());
        expect([...result]).toEqual([
            0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
        ]);
    });

    it("handles 0xFF fill bytes before markers", () => {
        const result = stripImageMetadata(jpegWithFillBytes());
        expect([...result]).toEqual([
            0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
        ]);
    });

    it("preserves ICC colour profile in APP2", () => {
        const input = jpegWithIccProfile();
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("strips EXIF while preserving ICC APP2", () => {
        const input = jpegWithIccAndExif();
        const result = stripImageMetadata(input);
        // APP1 removed, APP2 ICC retained
        expect(result).not.toBe(input);
        const iccPayload = [...ICC_PROFILE_ID, 0x01, 0x01];
        const iccLen = 2 + iccPayload.length;
        expect([...result]).toEqual([
            0xff,
            0xd8,
            0xff,
            0xe2,
            (iccLen >> 8) & 0xff,
            iccLen & 0xff,
            ...iccPayload,
            0xff,
            0xda,
            0x00,
            0x03,
            0x00,
            0xff,
            0xd9,
        ]);
    });

    it("strips non-ICC APP2", () => {
        const result = stripImageMetadata(jpegWithNonIccApp2());
        expect([...result]).toEqual([
            0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
        ]);
    });

    it("strips metadata between entropy-coded scans", () => {
        const input = new Uint8Array([
            0xff,
            0xd8,
            0xff,
            0xda,
            0x00,
            0x03,
            0x00,
            0x11, // first scan data
            0xff,
            0xe1,
            0x00,
            0x04,
            0x00,
            0x00, // APP1 between scans
            0xff,
            0xd9,
        ]);
        expect([...stripImageMetadata(input)]).toEqual([
            0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x00, 0x11, 0xff, 0xd9,
        ]);
    });
});

// ── PNG ──────────────────────────────────────────────────────────────────

describe("stripImageMetadata — PNG", () => {
    it("returns original reference for a clean PNG", () => {
        const input = pngClean();
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("strips tEXt chunks", () => {
        const result = stripImageMetadata(pngWithText());
        expect(result).not.toBe(pngWithText());
        expect([...result]).toEqual([...pngClean()]);
    });

    it("strips eXIf chunks", () => {
        const result = stripImageMetadata(pngWithExif());
        expect(result).not.toBe(pngWithExif());
        expect([...result]).toEqual([...pngClean()]);
    });
});

// ── WebP ─────────────────────────────────────────────────────────────────

describe("stripImageMetadata — WebP", () => {
    it("returns original reference for a clean WebP", () => {
        const input = webpClean();
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("strips EXIF chunks and updates RIFF file size", () => {
        const result = stripImageMetadata(webpWithExif());
        expect(result).not.toBe(webpWithExif());
        expect([...result]).toEqual([...webpClean()]);
    });
});

// GIF helpers

// Minimal valid GIF89a: 1x1 pixel, no GCT, single transparent frame
function gifMinimal(): Uint8Array {
    return new Uint8Array([
        // Header
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
        // Logical Screen Descriptor: 1x1, no GCT
        0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
        // Image Descriptor
        0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        // LZW min code size + data sub-block + terminator
        0x02, 0x02, 0x4c, 0x01, 0x00,
        // Trailer
        0x3b,
    ]);
}

function gifWithComment(): Uint8Array {
    // Comment Extension: 0x21 0xFE, sub-block "GPS:lat=51", terminator
    const comment = [
        0x47, 0x50, 0x53, 0x3a, 0x6c, 0x61, 0x74, 0x3d, 0x35, 0x31,
    ];
    return new Uint8Array([
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x00,
        // Comment Extension
        0x21,
        0xfe,
        comment.length,
        ...comment,
        0x00,
        // Image Descriptor
        0x2c,
        0x00,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x02,
        0x02,
        0x4c,
        0x01,
        0x00,
        0x3b,
    ]);
}

function gifWithAppExtension(): Uint8Array {
    // Application Extension (0xFF): 11-byte app id + sub-block data
    const appId = [
        0x58, 0x4d, 0x50, 0x20, 0x44, 0x61, 0x74, 0x61, 0x58, 0x4d, 0x50,
    ]; // "XMP DataXMP"
    const xmpData = [0x3c, 0x78, 0x3a, 0x78]; // truncated XMP payload
    return new Uint8Array([
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x00,
        // Application Extension
        0x21,
        0xff,
        appId.length,
        ...appId,
        xmpData.length,
        ...xmpData,
        0x00,
        // Image Descriptor
        0x2c,
        0x00,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x02,
        0x02,
        0x4c,
        0x01,
        0x00,
        0x3b,
    ]);
}

// GIF tests

describe("stripImageMetadata - GIF", () => {
    it("returns original reference for a clean GIF", () => {
        const input = gifMinimal();
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("strips Comment Extension (0xFE)", () => {
        const result = stripImageMetadata(gifWithComment());
        expect(result).not.toBe(gifWithComment());
        expect([...result]).toEqual([...gifMinimal()]);
    });

    it("strips Application Extension carrying XMP (0xFF)", () => {
        const result = stripImageMetadata(gifWithAppExtension());
        expect(result).not.toBe(gifWithAppExtension());
        expect([...result]).toEqual([...gifMinimal()]);
    });

    it("returns a truncated GIF header unchanged", () => {
        const stub = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
        expect(stripImageMetadata(stub)).toBe(stub);
    });
});

// ── Resilience ───────────────────────────────────────────────────────────

describe("stripImageMetadata — resilience", () => {
    it("returns BMP unchanged (no metadata container)", () => {
        const bmp = new Uint8Array([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00]);
        expect(stripImageMetadata(bmp)).toBe(bmp);
    });

    it("returns a truncated JPEG header unchanged", () => {
        const stub = new Uint8Array([0xff, 0xd8, 0xff]);
        expect(stripImageMetadata(stub)).toBe(stub);
    });

    it("returns a truncated PNG unchanged", () => {
        const stub = new Uint8Array([...PNG_SIG, 0x00]);
        expect(stripImageMetadata(stub)).toBe(stub);
    });

    it("rejects JPEG metadata followed by a truncated segment", () => {
        const input = new Uint8Array([
            0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00,
        ]);
        expect(() => stripImageMetadata(input)).toThrow(
            InvalidImageStructureError,
        );
    });

    it("rejects PNG metadata followed by a truncated chunk", () => {
        const input = new Uint8Array([
            ...PNG_SIG,
            ...pngChunk("tEXt", [0x41]),
            0x00,
            0x00,
            0x00,
            0x04,
            0x49,
            0x44,
            0x41,
            0x54,
            0x00,
        ]);
        expect(() => stripImageMetadata(input)).toThrow(
            InvalidImageStructureError,
        );
    });

    it("rejects WebP metadata followed by a truncated chunk", () => {
        const exifChunk = [
            0x45, 0x58, 0x49, 0x46, 0x04, 0x00, 0x00, 0x00, 0x45, 0x78, 0x69,
            0x66,
        ];
        const truncatedVp8 = [
            0x56, 0x50, 0x38, 0x20, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        const totalLength = 12 + exifChunk.length + truncatedVp8.length;
        const riffSize = totalLength - 8;
        const input = new Uint8Array([
            0x52,
            0x49,
            0x46,
            0x46,
            riffSize & 0xff,
            (riffSize >> 8) & 0xff,
            (riffSize >> 16) & 0xff,
            (riffSize >> 24) & 0xff,
            0x57,
            0x45,
            0x42,
            0x50,
            ...exifChunk,
            ...truncatedVp8,
        ]);
        expect(() => stripImageMetadata(input)).toThrow(
            InvalidImageStructureError,
        );
    });

    it("rejects WebP metadata when the RIFF size is inconsistent", () => {
        const input = webpWithExif();
        input[4]--;
        expect(() => stripImageMetadata(input)).toThrow(
            InvalidImageStructureError,
        );
    });

    it("rejects GIF metadata followed by a missing trailer", () => {
        const input = gifWithComment().subarray(0, -1);
        expect(() => stripImageMetadata(input)).toThrow(
            InvalidImageStructureError,
        );
    });

    it("returns a clean GIF missing trailer unchanged", () => {
        const input = gifMinimal().subarray(0, -1);
        expect(stripImageMetadata(input)).toBe(input);
    });

    it("returns empty input unchanged", () => {
        const empty = new Uint8Array(0);
        expect(stripImageMetadata(empty)).toBe(empty);
    });
});
