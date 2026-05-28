/// <reference types="@cloudflare/workers-types" />

export const DEFAULT_R2_TTL_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type RefreshR2ObjectTtlOptions = {
    minRefreshIntervalMs?: number;
    now?: () => Date;
};

async function writeReadableToWritable(
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<ArrayBuffer | ArrayBufferView>,
): Promise<void> {
    const reader = readable.getReader();
    const writer = writable.getWriter();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
        }
        await writer.close();
    } catch (error) {
        await writer.abort(error).catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
        writer.releaseLock();
    }
}

export function refreshR2ObjectTtl(
    bucket: R2Bucket,
    key: string,
    object: R2ObjectBody,
    waitUntil: (promise: Promise<unknown>) => void,
    onError: (error: unknown) => void,
    options: RefreshR2ObjectTtlOptions = {},
): ReadableStream {
    const minRefreshIntervalMs =
        options.minRefreshIntervalMs ?? DEFAULT_R2_TTL_REFRESH_INTERVAL_MS;
    const ageMs =
        (options.now?.() ?? new Date()).getTime() - object.uploaded.getTime();

    // R2 has no metadata-only touch; rewriting resets lifecycle age but is a
    // Class A write, so avoid refreshing hot objects on every read.
    if (ageMs < minRefreshIntervalMs) {
        return object.body;
    }

    const [responseBody, refreshBody] = object.body.tee();
    const fixedLengthStream = new FixedLengthStream(object.size);

    waitUntil(
        Promise.all([
            writeReadableToWritable(
                refreshBody as ReadableStream<Uint8Array>,
                fixedLengthStream.writable,
            ),
            bucket.put(key, fixedLengthStream.readable, {
                httpMetadata: object.httpMetadata,
                customMetadata: object.customMetadata,
                storageClass: object.storageClass,
            }),
        ])
            .then(() => undefined)
            .catch(onError),
    );

    return responseBody;
}
