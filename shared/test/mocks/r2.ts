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
            writeHttpMetadata(headers: Headers) {
                if (object.httpMetadata?.contentType) {
                    headers.set(
                        "Content-Type",
                        object.httpMetadata.contentType,
                    );
                }
                if (object.httpMetadata?.cacheControl) {
                    headers.set(
                        "Cache-Control",
                        object.httpMetadata.cacheControl,
                    );
                }
                if (object.httpMetadata?.contentDisposition) {
                    headers.set(
                        "Content-Disposition",
                        object.httpMetadata.contentDisposition,
                    );
                }
                if (object.httpMetadata?.contentEncoding) {
                    headers.set(
                        "Content-Encoding",
                        object.httpMetadata.contentEncoding,
                    );
                }
                if (object.httpMetadata?.contentLanguage) {
                    headers.set(
                        "Content-Language",
                        object.httpMetadata.contentLanguage,
                    );
                }
            },
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
        list: async (options: R2ListOptions = {}) => {
            const start = Number(options.cursor ?? "0");
            const limit = options.limit ?? 1000;
            const keys = [...objects.keys()]
                .filter((key) => key.startsWith(options.prefix ?? ""))
                .sort();
            const selected = keys.slice(start, start + limit);
            const next = start + selected.length;
            return {
                objects: selected.flatMap((key) => {
                    const object = objects.get(key);
                    return object ? [createR2Object(key, object)] : [];
                }),
                truncated: next < keys.length,
                cursor: next < keys.length ? String(next) : undefined,
                delimitedPrefixes: [],
            };
        },
        delete: async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
                objects.delete(key);
            }
        },
        getObject: (key: string) => objects.get(key),
        get putCount() {
            return putCount;
        },
    } as unknown as TestR2Bucket;
}
