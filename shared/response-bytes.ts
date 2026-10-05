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

    // Fill one allocation when the size is known. Grow unknown/misreported
    // bodies without retaining all chunks alongside a second full-sized copy.
    let bytes = new Uint8Array(
        Math.min(declaredSize > 0 ? declaredSize : 64 * 1024, maxBytes),
    );
    const reader = response.body.getReader();
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const nextTotal = total + value.byteLength;
            if (nextTotal > maxBytes) throw tooLarge(nextTotal);
            if (nextTotal > bytes.length) {
                const grown = new Uint8Array(
                    Math.min(maxBytes, Math.max(nextTotal, bytes.length * 2)),
                );
                grown.set(bytes.subarray(0, total));
                bytes = grown;
            }
            bytes.set(value, total);
            total = nextTotal;
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
    return bytes.subarray(0, total);
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
