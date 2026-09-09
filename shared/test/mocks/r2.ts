/// <reference types="@cloudflare/workers-types" />

export type StoredR2Object = {
    body: Uint8Array;
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
    storageClass?: R2Object["storageClass"];
    uploaded: Date;
};

export type TestR2Bucket = R2Bucket & {
    getObject(key: string): StoredR2Object | undefined;
    readonly putCount: number;
};

export function createTestR2Bucket(): TestR2Bucket {
    const objects = new Map<string, StoredR2Object>();
    let putCount = 0;
    let uploadTime = 0;

    function createR2Object(key: string, object: StoredR2Object): R2Object {
        return {
            key,
            version: "test",
            size: object.body.byteLength,
            etag: "test",
            httpEtag: '"test"',
            uploaded: object.uploaded,
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
            storageClass: object.storageClass,
            checksums: {},
        } as unknown as R2Object;
    }

    return {
        head: async (key: string) => {
            const object = objects.get(key);
            return object ? createR2Object(key, object) : null;
        },
        get: async (key: string) => {
            const object = objects.get(key);
            if (!object) return null;
            return {
                ...createR2Object(key, object),
                body: new Response(object.body.slice()).body,
            };
        },
        put: async (key: string, value: BodyInit, options?: R2PutOptions) => {
            const httpMetadata =
                options?.httpMetadata instanceof Headers
                    ? undefined
                    : options?.httpMetadata;

            putCount += 1;
            uploadTime += 1;
            objects.set(key, {
                body: new Uint8Array(await new Response(value).arrayBuffer()),
                httpMetadata,
                customMetadata: options?.customMetadata,
                storageClass: options?.storageClass,
                uploaded: new Date(uploadTime),
            });
            return null;
        },
        getObject: (key: string) => objects.get(key),
        get putCount() {
            return putCount;
        },
    } as unknown as TestR2Bucket;
}
