const cache = new Map<string, Promise<{ base64: string; mimeType: string }>>();

async function generateTransparentImageRaw(
    width: number,
    height: number,
): Promise<{ base64: string; mimeType: string }> {
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = new Uint8Array(13);
    const ihdrView = new DataView(ihdrData.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdrData[8] = 8;
    ihdrData[9] = 6;
    const ihdrChunk = buildPngChunk("IHDR", ihdrData);

    const rawData = new Uint8Array((1 + width * 4) * height);
    const idatChunk = buildPngChunk("IDAT", await deflate(rawData));
    const iendChunk = buildPngChunk("IEND", new Uint8Array(0));
    const png = concatUint8Arrays([signature, ihdrChunk, idatChunk, iendChunk]);

    return { base64: uint8ArrayToBase64(png), mimeType: "image/png" };
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new CompressionStream("deflate");
    const writer = stream.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>);
    await writer.close();

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return concatUint8Arrays(chunks);
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);

    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcInput));
    return chunk;
}

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(
        arrays.reduce((total, item) => total + item.length, 0),
    );
    let offset = 0;
    for (const item of arrays) {
        result.set(item, offset);
        offset += item.length;
    }
    return result;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function generateTransparentImage(
    width: number,
    height: number,
): Promise<{ base64: string; mimeType: string }> {
    const key = `${width}x${height}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = generateTransparentImageRaw(width, height);
    cache.set(key, promise);
    return promise;
}
