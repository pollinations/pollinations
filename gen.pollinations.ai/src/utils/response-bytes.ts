/**
 * Read a response body without ever buffering more than `maxBytes`.
 *
 * Content-Length is checked before streaming, then the running byte count is
 * checked while reading because the header can be absent or incorrect.
 */
export async function readResponseBytes(
    response: Response,
    maxBytes: number,
    tooLarge: (total: number) => Error,
): Promise<Uint8Array<ArrayBuffer>> {
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
        const declaredSize = Number.parseInt(contentLength, 10);
        if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
            throw tooLarge(declaredSize);
        }
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
            throw tooLarge(arrayBuffer.byteLength);
        }
        return new Uint8Array(arrayBuffer);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) throw tooLarge(total);
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
