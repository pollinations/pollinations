import { detectImageMimeType } from "./image-mime.ts";

/**
 * Strip privacy-sensitive metadata (EXIF, IPTC, XMP, GPS, comments) from
 * user-supplied input images. Uses pure binary marker slicing — no pixel
 * decoding, no dependencies, sub-millisecond on Cloudflare Workers.
 *
 * Returns a clean copy when metadata was found, or the original reference
 * when the image is already clean or the format is unsupported.
 */
export function stripImageMetadata(bytes: Uint8Array): Uint8Array {
    const mime = detectImageMimeType(bytes);
    if (mime === "image/jpeg") return stripJpegMetadata(bytes);
    if (mime === "image/png") return stripPngMetadata(bytes);
    if (mime === "image/webp") return stripWebpMetadata(bytes);
    return bytes;
}

// ---------------------------------------------------------------------------
// JPEG: drop APP1 (EXIF/XMP), APP2 (ICC — often embeds camera data),
//       APP13 (IPTC/Photoshop), COM (comments).  Keep everything else.
// ---------------------------------------------------------------------------

const JPEG_STRIP_MARKERS = new Set([0xe1, 0xe2, 0xed, 0xfe]);

function stripJpegMetadata(data: Uint8Array): Uint8Array {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return data;

    const segments: Uint8Array[] = [data.subarray(0, 2)]; // SOI
    let offset = 2;
    let stripped = false;

    while (offset + 3 < data.length) {
        if (data[offset] !== 0xff) break;
        const marker = data[offset + 1];

        // Standalone markers (RST, TEM) or padding 0xFF bytes
        if (
            marker === 0x00 ||
            marker === 0x01 ||
            (marker >= 0xd0 && marker <= 0xd7)
        ) {
            segments.push(data.subarray(offset, offset + 2));
            offset += 2;
            continue;
        }

        // SOS (0xDA) — rest of file is entropy-coded image data
        if (marker === 0xda) {
            segments.push(data.subarray(offset));
            break;
        }

        // EOI
        if (marker === 0xd9) {
            segments.push(data.subarray(offset, offset + 2));
            break;
        }

        // Variable-length segment
        const segLen = (data[offset + 2] << 8) | data[offset + 3];
        if (segLen < 2 || offset + 2 + segLen > data.length) break;
        const totalLen = 2 + segLen; // marker (2) + length field + payload

        if (JPEG_STRIP_MARKERS.has(marker)) {
            stripped = true;
        } else {
            segments.push(data.subarray(offset, offset + totalLen));
        }
        offset += totalLen;
    }

    if (!stripped) return data;

    let totalSize = 0;
    for (const seg of segments) totalSize += seg.length;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const seg of segments) {
        out.set(seg, pos);
        pos += seg.length;
    }
    return out;
}

// ---------------------------------------------------------------------------
// PNG: drop eXIf, tEXt, zTXt, iTXt, tIME chunks.  Keep IHDR/PLTE/IDAT/IEND.
// ---------------------------------------------------------------------------

const PNG_STRIP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
const PNG_HEADER_LEN = 8;

function stripPngMetadata(data: Uint8Array): Uint8Array {
    if (data.length < PNG_HEADER_LEN + 12) return data;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const segments: Uint8Array[] = [data.subarray(0, PNG_HEADER_LEN)]; // signature
    let offset = PNG_HEADER_LEN;
    let stripped = false;

    while (offset + 12 <= data.length) {
        const chunkDataLen = view.getUint32(offset);
        const chunkName = String.fromCharCode(
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        );
        const chunkTotal = 4 + 4 + chunkDataLen + 4; // length + name + data + CRC

        if (offset + chunkTotal > data.length) break;

        if (PNG_STRIP_CHUNKS.has(chunkName)) {
            stripped = true;
        } else {
            segments.push(data.subarray(offset, offset + chunkTotal));
        }
        offset += chunkTotal;
    }

    if (!stripped) return data;

    let totalSize = 0;
    for (const seg of segments) totalSize += seg.length;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const seg of segments) {
        out.set(seg, pos);
        pos += seg.length;
    }
    return out;
}

// ---------------------------------------------------------------------------
// WebP: drop EXIF and XMP RIFF chunks, clear VP8X feature flags.
// ---------------------------------------------------------------------------

function stripWebpMetadata(data: Uint8Array): Uint8Array {
    // Minimum: RIFF(4) + size(4) + WEBP(4) + at least one sub-chunk header(8)
    if (data.length < 20) return data;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const segments: Uint8Array[] = [data.subarray(0, 12)]; // RIFF + filesize + WEBP
    let offset = 12;
    let stripped = false;
    let vp8xOffset = -1;

    while (offset + 8 <= data.length) {
        const fourCC = String.fromCharCode(
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        );
        const chunkSize = view.getUint32(offset + 4, true);
        const paddedSize = chunkSize + (chunkSize & 1); // RIFF chunks are 2-byte aligned
        const chunkTotal = 8 + paddedSize;

        if (offset + chunkTotal > data.length) break;

        if (fourCC === "EXIF" || fourCC === "XMP ") {
            stripped = true;
        } else {
            if (fourCC === "VP8X") {
                vp8xOffset = segments.reduce((sum, s) => sum + s.length, 0);
            }
            segments.push(data.subarray(offset, offset + chunkTotal));
        }
        offset += chunkTotal;
    }

    if (!stripped) return data;

    let totalSize = 0;
    for (const seg of segments) totalSize += seg.length;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const seg of segments) {
        out.set(seg, pos);
        pos += seg.length;
    }

    // Update RIFF file size (bytes 4–7, little-endian, = total - 8)
    const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
    outView.setUint32(4, out.length - 8, true);

    // Clear EXIF (bit 3) and XMP (bit 2) flags in VP8X if present
    if (vp8xOffset >= 0 && vp8xOffset + 18 <= out.length) {
        out[vp8xOffset + 8] &= ~0x08; // clear EXIF flag
        out[vp8xOffset + 8] &= ~0x04; // clear XMP flag
    }

    return out;
}
