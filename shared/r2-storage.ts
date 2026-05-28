/// <reference types="@cloudflare/workers-types" />

export function refreshR2ObjectTtl(
    bucket: R2Bucket,
    key: string,
    object: R2ObjectBody,
    waitUntil: (promise: Promise<unknown>) => void,
    onError: (error: unknown) => void,
): ReadableStream {
    const [responseBody, refreshBody] = object.body.tee();

    waitUntil(
        bucket
            .put(key, refreshBody, {
                httpMetadata: object.httpMetadata,
                customMetadata: object.customMetadata,
                storageClass: object.storageClass,
            })
            .catch(onError),
    );

    return responseBody;
}
