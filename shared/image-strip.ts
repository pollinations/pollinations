import { detectImageMimeType } from "./image-mime.ts";

export class InvalidImageStructureError extends Error {
    constructor(format: string) {
        super(`Malformed ${format} image`);
        this.name = "InvalidImageStructureError";
    }
}

function malformedAfterMetadata(
    data: Uint8Array,
    stripped: boolean,
    format: string,
): Uint8Array {
    if (stripped) throw new InvalidImageStructureError(format);
    return data;
}

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
// JPEG: drop APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), COM (comments).
//       APP2 is kept when it carries an ICC colour profile; stripped otherwise.
// ---------------------------------------------------------------------------

/** Markers always stripped: APP1, APP13, COM.  APP2 handled separately. */
const JPEG_STRIP_MARKERS = new Set([0xe1, 0xed, 0xfe]);

/** `ICC_PROFILE\0` identifier at the start of ICC APP2 payloads. */
const ICC_PROFILE_TAG = new Uint8Array([
    0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
]);

function isIccProfile(
    data: Uint8Array,
    payloadStart: number,
    payloadLen: number,
): boolean {
    if (payloadLen < ICC_PROFILE_TAG.length) return false;
    for (let i = 0; i < ICC_PROFILE_TAG.length; i++) {
        if (data[payloadStart + i] !== ICC_PROFILE_TAG[i]) return false;
    }
    return true;
}

function stripJpegMetadata(data: Uint8Array): Uint8Array {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
        return data;
    }

    const segments: Uint8Array[] = [data.subarray(0, 2)]; // SOI
    let offset = 2;
    let stripped = false;
    let inScan = false;
    let scanStart = offset;
    let complete = false;

    while (offset < data.length) {
        if (inScan) {
            if (data[offset] !== 0xff) {
                offset++;
                continue;
            }

            let markerPos = offset + 1;
            while (markerPos < data.length && data[markerPos] === 0xff) {
                markerPos++;
            }
            if (markerPos >= data.length) {
                return malformedAfterMetadata(data, stripped, "JPEG");
            }
            const scanMarker = data[markerPos];
            if (
                scanMarker === 0x00 ||
                (scanMarker >= 0xd0 && scanMarker <= 0xd7)
            ) {
                offset = markerPos + 1;
                continue;
            }

            segments.push(data.subarray(scanStart, offset));
            inScan = false;
            // Parse the marker next, including any legal 0xFF fill bytes.
            continue;
        }

        if (data[offset] !== 0xff) {
            return malformedAfterMetadata(data, stripped, "JPEG");
        }

        // Consume legal 0xFF fill/padding bytes before the marker byte
        let pos = offset + 1;
        while (pos < data.length && data[pos] === 0xff) pos++;
        if (pos >= data.length) {
            return malformedAfterMetadata(data, stripped, "JPEG");
        }

        const marker = data[pos];

        // Standalone markers (RST, TEM) or byte-stuffing
        if (
            marker === 0x00 ||
            marker === 0x01 ||
            (marker >= 0xd0 && marker <= 0xd7)
        ) {
            segments.push(data.subarray(offset, pos + 1));
            offset = pos + 1;
            continue;
        }

        // EOI
        if (marker === 0xd9) {
            segments.push(data.subarray(offset, pos + 1));
            offset = pos + 1;
            complete = offset === data.length;
            break;
        }

        // Variable-length segment: length field starts at pos+1
        if (pos + 2 >= data.length) {
            return malformedAfterMetadata(data, stripped, "JPEG");
        }
        const segLen = (data[pos + 1] << 8) | data[pos + 2];
        if (segLen < 2 || pos + 1 + segLen > data.length) {
            return malformedAfterMetadata(data, stripped, "JPEG");
        }
        const segEnd = pos + 1 + segLen;

        if (JPEG_STRIP_MARKERS.has(marker)) {
            stripped = true;
        } else if (marker === 0xe2) {
            // APP2: preserve ICC colour profiles, strip other APP2 metadata
            if (isIccProfile(data, pos + 3, segLen - 2)) {
                segments.push(data.subarray(offset, segEnd));
            } else {
                stripped = true;
            }
        } else {
            segments.push(data.subarray(offset, segEnd));
        }
        offset = segEnd;

        // Entropy-coded scan data ends at the next unstuffed, non-restart
        // marker. Continue parsing there so metadata between scans is removed.
        if (marker === 0xda) {
            inScan = true;
            scanStart = offset;
        }
    }

    if (!complete) return malformedAfterMetadata(data, stripped, "JPEG");

    if (!stripped) return data;

    let totalSize = 0;
    for (const seg of segments) totalSize += seg.length;
    const out = new Uint8Array(totalSize);
    let writePos = 0;
    for (const seg of segments) {
        out.set(seg, writePos);
        writePos += seg.length;
    }
    return out;
}

// ---------------------------------------------------------------------------
// PNG: drop eXIf, tEXt, zTXt, iTXt, tIME chunks.  Keep IHDR/PLTE/IDAT/IEND.
// ---------------------------------------------------------------------------

const PNG_STRIP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
const PNG_HEADER_LEN = 8;

function stripPngMetadata(data: Uint8Array): Uint8Array {
    if (data.length < PNG_HEADER_LEN + 12) {
        return data;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const segments: Uint8Array[] = [data.subarray(0, PNG_HEADER_LEN)]; // signature
    let offset = PNG_HEADER_LEN;
    let stripped = false;
    let complete = false;

    while (offset + 12 <= data.length) {
        const chunkDataLen = view.getUint32(offset);
        const chunkName = String.fromCharCode(
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        );
        const chunkTotal = 4 + 4 + chunkDataLen + 4; // length + name + data + CRC

        if (offset + chunkTotal > data.length) {
            return malformedAfterMetadata(data, stripped, "PNG");
        }

        if (PNG_STRIP_CHUNKS.has(chunkName)) {
            stripped = true;
        } else {
            segments.push(data.subarray(offset, offset + chunkTotal));
        }
        offset += chunkTotal;
        if (chunkName === "IEND") {
            complete = offset === data.length;
            break;
        }
    }

    if (!complete) return malformedAfterMetadata(data, stripped, "PNG");

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
    const declaredSizeValid = view.getUint32(4, true) === data.length - 8;
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

        if (offset + chunkTotal > data.length) {
            return malformedAfterMetadata(data, stripped, "WebP");
        }

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

    if (offset !== data.length || !declaredSizeValid) {
        return malformedAfterMetadata(data, stripped, "WebP");
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
