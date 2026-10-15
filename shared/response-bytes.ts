/**
 * Read a response body with a strict `maxBytes` payload limit.
 *
 * Content-Length is checked before streaming, then the running byte count is
 * checked while reading because the header can be absent or incorrect.
 */
export async function readResponseBytes(
    response: Response,
    maxBytes: number,
    tooLarge: (total: number) => Error,
): Promise<Uint8Array<ArrayBuffer>> {
    const declaredSize = Number.parseInt(
        response.headers.get("content-length") ?? "",
        10,
    );
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        throw tooLarge(declaredSize);
    }

    if (!response.body) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > maxBytes) {
            throw tooLarge(arrayBuffer.byteLength);
        }
        return new Uint8Array(arrayBuffer);
    }

    // Grow one native backing store to the bytes received. This avoids trusting
    // Content-Length for allocation or copying a second full-sized media body.
    const buffer = new ArrayBuffer(0, { maxByteLength: maxBytes });
    const bytes = new Uint8Array(buffer);
    const reader = response.body.getReader();
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const nextTotal = total + value.byteLength;
            if (nextTotal > maxBytes) throw tooLarge(nextTotal);
            buffer.resize(nextTotal);
            bytes.set(value, total);
            total = nextTotal;
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
    return bytes;
}

/** Read a bounded response as UTF-8 text without buffering an untrusted body. */
export async function readResponseText(
    response: Response,
    maxBytes: number,
    tooLarge: (total: number) => Error,
): Promise<string> {
    const bytes = await readResponseBytes(response, maxBytes, tooLarge);
    return new TextDecoder().decode(bytes);
}
