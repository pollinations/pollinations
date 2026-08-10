/// <reference types="@cloudflare/workers-types" />

export type StoredR2Object = {
    body: Uint8Array;
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
    storageClass?: R2Object["storageClass"];
    uploaded: Date;
    etag: string;
};

export type TestR2Bucket = R2Bucket & {
    getObject(key: string): StoredR2Object | undefined;
    readonly putCount: number;
};

export function createTestR2Bucket(): TestR2Bucket {
    const objects = new Map<string, StoredR2Object>();
    let putCount = 0;
    let uploadTime = 0;
    let etagCounter = 0;

    function createR2Object(key: string, object: StoredR2Object): R2Object {
        return {
            key,
            version: "test",
            size: object.body.byteLength,
            etag: object.etag,
            httpEtag: `"${object.etag}"`,
            uploaded: object.uploaded,
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
            storageClass: object.storageClass,
            checksums: {},
        } as unknown as R2Object;
    }

    // Mirrors the subset of R2's conditional semantics the gateway relies on:
    // `etagDoesNotMatch: "*"` is create-if-absent, `etagMatches` is a
    // compare-and-swap. Anything else is treated as unconditional.
    function preconditionHolds(
        existing: StoredR2Object | undefined,
        onlyIf: R2PutOptions["onlyIf"],
    ): boolean {
        if (!onlyIf || onlyIf instanceof Headers) return true;
        if (onlyIf.etagDoesNotMatch !== undefined) {
            if (onlyIf.etagDoesNotMatch === "*") return existing === undefined;
            return existing?.etag !== onlyIf.etagDoesNotMatch;
        }
        if (onlyIf.etagMatches !== undefined) {
            if (onlyIf.etagMatches === "*") return existing !== undefined;
            return existing?.etag === onlyIf.etagMatches;
        }
        return true;
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

            // Read the body BEFORE testing the precondition, so the check and
            // the write happen in one synchronous step. Awaiting between them
            // would let two concurrent conditional puts both see an empty slot
            // and both win, which real R2 never does — and which would quietly
            // defeat any test asserting single-flight behaviour.
            const body = new Uint8Array(
                await new Response(value).arrayBuffer(),
            );
            if (!preconditionHolds(objects.get(key), options?.onlyIf)) {
                return null;
            }

            putCount += 1;
            uploadTime += 1;
            etagCounter += 1;
            const stored: StoredR2Object = {
                body,
                httpMetadata,
                customMetadata: options?.customMetadata,
                storageClass: options?.storageClass,
                uploaded: new Date(uploadTime),
                etag: `test-${etagCounter}`,
            };
            objects.set(key, stored);
            return createR2Object(key, stored);
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
