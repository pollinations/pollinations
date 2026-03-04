import memoize from "lodash.memoize";

/**
 * Generates a minimal transparent PNG buffer for the exact requested dimensions.
 * Pure JS implementation — no sharp dependency.
 *
 * Creates a valid PNG with an IHDR chunk specifying the dimensions and a single
 * fully-transparent IDAT chunk. Vertex AI uses this to understand the target
 * aspect ratio.
 */
async function _generateTransparentImage(
    width: number,
    height: number,
): Promise<{ base64: string; mimeType: string }> {
    // Build a minimal valid PNG file programmatically.
    // PNG spec: signature + IHDR + IDAT + IEND
    // We use color type 6 (RGBA) with bit depth 8.

    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdrData = new Uint8Array(13);
    const ihdrView = new DataView(ihdrData.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 6; // color type: RGBA
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace
    const ihdrChunk = buildPngChunk("IHDR", ihdrData);

    // Build raw image data: each row is filter_byte(0) + width*4 zero bytes
    const rowBytes = 1 + width * 4; // filter byte + RGBA pixels
    const rawSize = rowBytes * height;
    const rawData = new Uint8Array(rawSize); // all zeros = transparent + filter none

    // Deflate the raw data using the Web Compression API (available in Workers)
    const compressedData = await deflateRaw(rawData);
    const idatChunk = buildPngChunk("IDAT", compressedData);

    // IEND chunk
    const iendChunk = buildPngChunk("IEND", new Uint8Array(0));

    // Concatenate all parts
    const png = concatUint8Arrays([signature, ihdrChunk, idatChunk, iendChunk]);

    const base64 = uint8ArrayToBase64(png);

    return {
        base64,
        mimeType: "image/png",
    };
}

/** Deflate raw data using the Web Compression API (zlib deflate). */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return concatUint8Arrays(chunks);
}

/** Build a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC. */
function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const length = data.length;

    const chunk = new Uint8Array(4 + 4 + length + 4);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);

    const crcData = new Uint8Array(4 + length);
    crcData.set(typeBytes, 0);
    crcData.set(data, 4);
    view.setUint32(8 + length, crc32(crcData));

    return chunk;
}

/** CRC32 as specified by the PNG spec. */
function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Memoized version - this is the exported function
export const generateTransparentImage = memoize(
    _generateTransparentImage,
    (width: number, height: number) => `${width}x${height}`,
);
