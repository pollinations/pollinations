import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { createApiKeyAuth } from "@shared/auth/api-key.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { mediaItem, mediaTag } from "@shared/db/media-catalog.ts";
import {
    serviceAuthorization,
    serviceBillingEvent,
} from "@shared/db/service-billing.ts";
import type {
    ServiceGatewayBinding,
    ServiceSettleResult,
} from "@shared/schemas/service-billing.ts";
import { createFetchMock } from "@shared/test/mocks/fetch.ts";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { enterGateway, gatewayEnv } from "./gateway.ts";

// 1x1 red PNG (67 bytes)
const TINY_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

interface UploadResponse {
    id: string;
    url: string;
    contentType: string;
    size: number;
    tags?: string[];
}

interface MediaItemResponse {
    id: string;
    url: string;
    contentType: string;
    size: number | null;
    tags: string[];
    createdAt: string;
}

interface MediaPageResponse {
    items: MediaItemResponse[];
    nextCursor: string | null;
    hasMore: boolean;
}

// Real API keys created through Enter's better-auth instance in beforeAll.
// The gateway authenticates them exactly as production does — bans, key
// types and BYOP attribution all come from real rows, not fixtures.
const keys = {
    /** user_alice's publishable key, attributed to her app key below. */
    pkAlice: "",
    /** The BYOP client (app) key pk_alice uploads are attributed to. */
    appKeyId: "",
    skAlice: "",
    /** Row id of skAlice: the parent key agent run tokens are minted from. */
    skAliceId: "",
    /** Secret key created before typed key metadata existed (no keyType). */
    skAliceLegacy: "",
    skBob: "",
    /** Key of a banned account. */
    pkBanned: "",
    /** Key of an account with negative balances in both buckets. */
    pkBroke: "",
};

// In-memory bucket shared by all fetchApp calls within one test (reading the
// real MEDIA_BUCKET binding from test-context requests leaks storage handles
// across vitest's isolated-storage stack).
let sharedBucket = createTestR2Bucket();

function createMediaEnv(
    bucket: R2Bucket = sharedBucket,
    gateway: ServiceGatewayBinding = enterGateway,
) {
    return {
        MEDIA_BUCKET: bucket,
        MAX_FILE_SIZE: "104857600",
        DB: env.DB,
        ENTER: gateway,
    };
}

/**
 * Drives the real worker app with the real gateway bound. Buffers the body
 * before waiting on the execution context so R2 streams are consumed and the
 * settlement waitUntil has completed by the time a test asserts.
 */
async function fetchApp(
    input: string | URL,
    init?: RequestInit,
    gateway: ServiceGatewayBinding = enterGateway,
): Promise<Response> {
    const ctx = createExecutionContext();
    const res = await app.fetch(
        new Request(input, init),
        createMediaEnv(sharedBucket, gateway),
        ctx,
    );
    const buffered = new Response(await res.arrayBuffer(), res);
    await waitOnExecutionContext(ctx);
    return buffered;
}

async function seedIdentities() {
    const db = drizzle(env.DB);
    const now = new Date();
    const users = [
        { id: "user_alice" },
        { id: "user_bob" },
        { id: "user_banned" },
        { id: "user_broke", tierBalance: -1, packBalance: -1 },
    ];
    for (const user of users) {
        await db
            .insert(userTable)
            .values({
                name: user.id,
                email: `${user.id}@test.com`,
                createdAt: now,
                updatedAt: now,
                ...user,
            })
            .onConflictDoNothing({ target: userTable.id });
    }

    const auth = createApiKeyAuth(gatewayEnv);
    const create = async (
        name: string,
        prefix: "pk" | "sk",
        userId: string,
        metadata?: Record<string, unknown>,
    ) => {
        const created = await auth.api.createApiKey({
            body: { name, prefix, userId, ...(metadata && { metadata }) },
        });
        if (!created.id || !created.key) {
            throw new Error(`Failed to create test key ${name}`);
        }
        return { id: created.id, key: created.key };
    };

    const app_ = await create("alice-app", "pk", "user_alice", {
        keyType: "publishable",
    });
    keys.appKeyId = app_.id;
    const pkAlice = await create("alice-pk", "pk", "user_alice", {
        keyType: "publishable",
    });
    keys.pkAlice = pkAlice.key;
    await db
        .update(apikeyTable)
        .set({ byopClientKeyId: app_.id })
        .where(eq(apikeyTable.id, pkAlice.id));
    const skAlice = await create("alice-sk", "sk", "user_alice", {
        keyType: "secret",
    });
    keys.skAlice = skAlice.key;
    keys.skAliceId = skAlice.id;
    keys.skAliceLegacy = (await create("alice-legacy", "sk", "user_alice")).key;
    keys.skBob = (
        await create("bob-sk", "sk", "user_bob", { keyType: "secret" })
    ).key;
    keys.pkBanned = (
        await create("banned-pk", "pk", "user_banned", {
            keyType: "publishable",
        })
    ).key;
    keys.pkBroke = (
        await create("broke-pk", "pk", "user_broke", {
            keyType: "publishable",
        })
    ).key;
    await db
        .update(userTable)
        .set({ banned: true })
        .where(eq(userTable.id, "user_banned"));
}

function pngFile(name: string, bytes: Uint8Array = TINY_PNG): File {
    return new File([bytes], name, { type: "image/png" });
}

// Distinct byte content per upload, varying the same base PNG per seed.
function variant(seed: number): Uint8Array {
    const bytes = new Uint8Array(TINY_PNG);
    bytes[bytes.length - 1] = seed & 0xff;
    return bytes;
}

async function uploadViaForm(
    key: string,
    options: {
        fileName?: string;
        bytes?: Uint8Array;
        tags?: string[];
        extraFields?: Record<string, string>;
        gateway?: ServiceGatewayBinding;
        query?: string;
    } = {},
): Promise<{ status: number; body: UploadResponse | { error: string } }> {
    const form = new FormData();
    form.append(
        "file",
        pngFile(options.fileName ?? "test.png", options.bytes ?? TINY_PNG),
    );
    if (options.tags && options.tags.length > 0) {
        form.append("tags", options.tags.join(","));
    }
    for (const [field, value] of Object.entries(options.extraFields ?? {})) {
        form.append(field, value);
    }

    const res = await fetchApp(
        `https://media.pollinations.ai/upload${options.query ?? ""}`,
        {
            method: "POST",
            body: form,
            ...(options.query
                ? {}
                : { headers: { Authorization: `Bearer ${key}` } }),
        },
        options.gateway,
    );
    const body = (await res.json()) as UploadResponse | { error: string };
    return { status: res.status, body };
}

describe("media.pollinations.ai", () => {
    // Enter's settlement writes one analytics row to Tinybird after each
    // upload; the shared Tinybird mock absorbs it (and asserts nothing else
    // leaves the worker) instead of a dropped connection to localhost.
    const mocks = createFetchMock({ tinybird: createMockTinybird() });

    beforeAll(async () => {
        await mocks.enable("tinybird");
        await seedIdentities();
    });

    beforeEach(() => {
        sharedBucket = createTestR2Bucket();
    });

    it("GET / returns service info", async () => {
        const res = await fetchApp("https://media.pollinations.ai/");
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.service).toBe("media.pollinations.ai");
    });

    it("POST /upload without key returns 401", async () => {
        const res = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            body: TINY_PNG,
            headers: { "Content-Type": "image/png" },
        });
        expect(res.status).toBe(401);
    });

    it("upload and retrieve", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "test.png", { type: "image/png" }),
        );

        const uploadRes = await fetchApp(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${keys.pkAlice}` },
            },
        );
        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(upload.id).not.toBe("");
        expect(upload.url).toContain(upload.id);
        expect(upload.contentType).toBe("image/png");
        expect(upload.size).toBe(TINY_PNG.length);

        // Retrieve — check Content-Disposition
        const getRes = await fetchApp(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        expect(getRes.headers.get("content-type")).toBe("image/png");
        expect(getRes.headers.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
        );
        expect(getRes.headers.get("content-disposition")).toContain("test.png");
        const body = new Uint8Array(await getRes.arrayBuffer());
        expect(body.length).toBe(TINY_PNG.length);

        // HEAD
        const headRes = await fetchApp(
            `https://media.pollinations.ai/${upload.id}`,
            { method: "HEAD" },
        );
        expect(headRes.status).toBe(200);
        expect(headRes.headers.get("x-content-id")).toBe(upload.id);

        // Re-uploading the same bytes now yields a distinct new id.
        const dupForm = new FormData();
        dupForm.append(
            "file",
            new File([TINY_PNG], "test.png", { type: "image/png" }),
        );
        const dupRes = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            body: dupForm,
            headers: { Authorization: `Bearer ${keys.pkAlice}` },
        });
        const dup = (await dupRes.json()) as UploadResponse;
        expect(dup.id).not.toBe(upload.id);
    });

    it("uploads via base64 JSON", async () => {
        const base64 = btoa(String.fromCharCode(...TINY_PNG));
        const uploadRes = await fetchApp(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${keys.pkAlice}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: `data:image/png;base64,${base64}`,
                    contentType: "image/png",
                    name: "test.png",
                    // JSON array form — the natural shape for a JSON API caller.
                    tags: ["gallery"],
                }),
            },
        );
        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(upload.id).not.toBe("");
        expect(upload.contentType).toBe("image/png");
        expect(upload.size).toBe(TINY_PNG.length);
        expect(upload.tags).toEqual(["gallery"]);

        const getRes = await fetchApp(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        const body = new Uint8Array(await getRes.arrayBuffer());
        expect(body.length).toBe(TINY_PNG.length);
    });

    it("validates the documented JSON upload shape", async () => {
        for (const body of [null, { data: "AAAA", tags: [42] }]) {
            const res = await fetchApp("https://media.pollinations.ai/upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${keys.pkAlice}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            expect(res.status).toBe(400);
            expect(((await res.json()) as { error: string }).error).toContain(
                "Invalid JSON body",
            );
        }
    });

    it("rejects an unsupported upload content type with 400", async () => {
        const res = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            body: TINY_PNG,
            headers: {
                Authorization: `Bearer ${keys.pkAlice}`,
                "Content-Type": "image/png",
            },
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("multipart/form-data");
    });

    it("applies the size limit to file bytes, not total request bytes", async () => {
        const bucket = createTestR2Bucket();
        const form = new FormData();
        form.append(
            "file",
            new File([new Uint8Array([1, 2])], "tiny.bin", {
                type: "application/octet-stream",
            }),
        );

        const ctx = createExecutionContext();
        const res = await app.fetch(
            new Request("https://media.pollinations.ai/upload", {
                method: "POST",
                body: form,
                headers: {
                    Authorization: `Bearer ${keys.pkAlice}`,
                    "Content-Length": "1000",
                },
            }),
            {
                ...createMediaEnv(bucket),
                MAX_FILE_SIZE: "3",
            },
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        expect(((await res.json()) as UploadResponse).size).toBe(2);
    });

    it("rejects empty files, invalid base64, and malformed JSON with 400", async () => {
        const emptyForm = new FormData();
        emptyForm.append(
            "file",
            new File([], "empty.png", { type: "image/png" }),
        );
        const emptyRes = await fetchApp(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: emptyForm,
                headers: { Authorization: `Bearer ${keys.pkAlice}` },
            },
        );
        expect(emptyRes.status).toBe(400);

        const badBase64 = await fetchApp(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${keys.pkAlice}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ data: "!!!not-base64!!!" }),
            },
        );
        expect(badBase64.status).toBe(400);

        const badJson = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${keys.pkAlice}`,
                "Content-Type": "application/json",
            },
            body: "{not json",
        });
        expect(badJson.status).toBe(400);
    });

    it("refreshes uploaded media TTL on aged GET", async () => {
        const bucket = createTestR2Bucket();
        const mediaEnv = createMediaEnv(bucket);
        const uploadCtx = createExecutionContext();

        const uploadForm = new FormData();
        uploadForm.append("file", pngFile("ttl.png"));
        const uploadRes = await app.fetch(
            new Request("https://media.pollinations.ai/upload", {
                method: "POST",
                body: uploadForm,
                headers: { Authorization: `Bearer ${keys.pkAlice}` },
            }),
            mediaEnv,
            uploadCtx,
        );
        await waitOnExecutionContext(uploadCtx);

        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(bucket.putCount).toBe(1);

        const getCtx = createExecutionContext();
        const getRes = await app.fetch(
            new Request(`https://media.pollinations.ai/${upload.id}`),
            mediaEnv,
            getCtx,
        );
        const body = new Uint8Array(await getRes.arrayBuffer());
        await waitOnExecutionContext(getCtx);

        expect(getRes.status).toBe(200);
        expect(body.length).toBe(TINY_PNG.length);
        expect(bucket.putCount).toBe(2);
    });

    it("identical uploads get distinct ids", async () => {
        const form1 = new FormData();
        form1.append(
            "file",
            new File([TINY_PNG], "a.png", { type: "image/png" }),
        );
        const form2 = new FormData();
        form2.append(
            "file",
            new File([TINY_PNG], "a.png", { type: "image/png" }),
        );

        const res1 = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form1,
            headers: { Authorization: `Bearer ${keys.pkAlice}` },
        });
        const res2 = await fetchApp("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form2,
            headers: { Authorization: `Bearer ${keys.pkAlice}` },
        });

        const upload1 = (await res1.json()) as UploadResponse;
        const upload2 = (await res2.json()) as UploadResponse;
        expect(upload1.id).not.toBe(upload2.id);
    });

    it("GET /:nonexistent-id returns 404", async () => {
        const res = await fetchApp(
            "https://media.pollinations.ai/does-not-exist",
        );
        expect(res.status).toBe(404);
    });

    it("retrieves a legacy content-hash-keyed object by its old URL", async () => {
        // Before this change, blobs were stored under a 16-hex content hash and
        // served at /:hash. Those objects still live in R2 under the hash key.
        // Retrieval is now key-agnostic (R2.get(id)), so the old URL must still
        // resolve. Seed such an object directly, bypassing upload.
        const bucket = createTestR2Bucket();
        const legacyHash = "a3f2b1c4d5e6f7a8";
        await bucket.put(legacyHash, TINY_PNG, {
            httpMetadata: { contentType: "image/png" },
            customMetadata: { originalName: "legacy.png" },
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(
            new Request(`https://media.pollinations.ai/${legacyHash}`),
            createMediaEnv(bucket),
            ctx,
        );
        const body = new Uint8Array(await res.arrayBuffer());
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(res.headers.get("x-content-id")).toBe(legacyHash);
        expect(res.headers.get("content-disposition")).toContain("legacy.png");
        expect(body.length).toBe(TINY_PNG.length);
    });

    it("tagged upload is published to the tag gallery, without owner fields", async () => {
        const { status, body } = await uploadViaForm(keys.pkAlice, {
            fileName: "gallery-a.png",
            bytes: variant(1),
            tags: ["Sunset "],
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;
        expect(upload.tags).toEqual(["sunset"]);

        // Published uploads are deletable, so retrieval and metadata must not
        // remain in browser or intermediary caches after deletion.
        const getRes = await fetchApp(upload.url);
        expect(getRes.headers.get("cache-control")).toBe("no-store");
        await getRes.arrayBuffer();
        const metadataRes = await fetchApp(`${upload.url}/metadata`);
        expect(metadataRes.headers.get("cache-control")).toBe("no-store");
        const headRes = await fetchApp(upload.url, { method: "HEAD" });
        expect(headRes.headers.get("cache-control")).toBe("no-store");

        const galleryRes = await fetchApp(
            "https://media.pollinations.ai/media?tag=sunset",
        );
        expect(galleryRes.status).toBe(200);
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).toContain(upload.url);
        for (const item of gallery.items) {
            expect(item).not.toHaveProperty("ownerUserId");
            expect(item).not.toHaveProperty("appKeyId");
        }

        // Tag lookups normalize like the write side — case must not matter.
        const upperRes = await fetchApp(
            "https://media.pollinations.ai/media?tag=SUNSET",
        );
        expect(upperRes.status).toBe(200);
        const upperGallery = (await upperRes.json()) as MediaPageResponse;
        expect(upperGallery.items.map((i) => i.url)).toContain(upload.url);
    });

    it("untagged upload is not cataloged: unlisted but retrievable", async () => {
        const { status, body } = await uploadViaForm(keys.pkAlice, {
            fileName: "untagged.png",
            bytes: variant(2),
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;
        expect(upload.tags).toBeUndefined();

        // No catalog row at all — untagged means unpublished, not "cataloged
        // but hidden".
        const db = drizzle(env.DB);
        const rows = await db
            .select({ id: mediaItem.id })
            .from(mediaItem)
            .where(eq(mediaItem.id, upload.id));
        expect(rows).toHaveLength(0);

        const galleryRes = await fetchApp(
            "https://media.pollinations.ai/media?tag=some-other-tag",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);

        // The blob itself is still retrievable by its unguessable id.
        const getRes = await fetchApp(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        await getRes.arrayBuffer();
    });

    it("stamps owner and app from the verified key, ignoring spoofed form fields", async () => {
        const alice = await uploadViaForm(keys.pkAlice, {
            fileName: "spoof-alice.png",
            bytes: variant(3),
            tags: ["spoof-test"],
            extraFields: {
                owner: "user_bob",
                app: "pk_app_evil",
                byopClientKeyId: "pk_app_evil",
            },
        });
        expect(alice.status).toBe(200);
        const aliceUpload = alice.body as UploadResponse;

        // The catalog row carries the identity attested by Enter's
        // authorization — pk_alice → user_alice via her app key — not the
        // form fields.
        const db = drizzle(env.DB);
        const [row] = await db
            .select({
                ownerUserId: mediaItem.ownerUserId,
                appKeyId: mediaItem.appKeyId,
            })
            .from(mediaItem)
            .where(eq(mediaItem.id, aliceUpload.id));
        expect(row).toEqual({
            ownerUserId: "user_alice",
            appKeyId: keys.appKeyId,
        });
    });

    it("rejects invalid tags with 400", async () => {
        const upperCase = await uploadViaForm(keys.pkAlice, {
            fileName: "bad-tag-1.png",
            bytes: variant(5),
            tags: ["UPPER CASE!"],
        });
        expect(upperCase.status).toBe(400);
        expect((upperCase.body as { error: string }).error).toMatch(
            /UPPER CASE!/,
        );

        const leadingDash = await uploadViaForm(keys.pkAlice, {
            fileName: "bad-tag-2.png",
            bytes: variant(6),
            tags: ["-leading"],
        });
        expect(leadingDash.status).toBe(400);
        expect((leadingDash.body as { error: string }).error).toMatch(
            /-leading/,
        );
    });

    it("does not treat singular tag as catalog metadata", async () => {
        const res = await uploadViaForm(keys.pkAlice, {
            fileName: "singular-tag-ignored.png",
            bytes: variant(30),
            extraFields: { tag: "legacy" },
        });
        expect(res.status).toBe(200);
        const upload = res.body as UploadResponse;
        expect(upload.tags).toBeUndefined();

        const galleryRes = await fetchApp(
            "https://media.pollinations.ai/media?tag=legacy",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);
    });

    it("does not accept undocumented upload tags from the query string", async () => {
        const form = new FormData();
        form.append("file", pngFile("query-tag.png", variant(31)));
        const res = await fetchApp(
            "https://media.pollinations.ai/upload?tags=query-tag",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${keys.pkAlice}` },
            },
        );
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;
        expect(upload.tags).toBeUndefined();

        const galleryRes = await fetchApp(
            "https://media.pollinations.ai/media?tag=query-tag",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((item) => item.id)).not.toContain(upload.id);
    });

    it("rejects more than 8 tags with 400", async () => {
        const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
        const res = await uploadViaForm(keys.pkAlice, {
            fileName: "too-many-tags.png",
            bytes: variant(7),
            tags,
        });
        expect(res.status).toBe(400);
    });

    it("key without typed metadata acts as a secret key (legacy keys)", async () => {
        // Keys created before typed key metadata carry no keyType; media must
        // fall back to "secret" like /account/key does, so their owner can
        // still publish and delete.
        const upload = await uploadViaForm(keys.skAliceLegacy, {
            fileName: "legacy.png",
            bytes: variant(11),
            tags: ["legacy-tag"],
        });
        expect(upload.status).toBe(200);
        const item = upload.body as UploadResponse;

        const deleted = await fetchApp(
            `https://media.pollinations.ai/media/${item.id}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${keys.skAliceLegacy}` },
            },
        );
        expect(deleted.status).toBe(200);
    });

    it("upload authorizes with Enter first, then settles one media.upload event", async () => {
        const { status, body } = await uploadViaForm(keys.pkAlice, {
            fileName: "billed.png",
            bytes: variant(8),
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;

        // The authorization uses the media id as its stable request identity
        // and snapshots the caller Enter authenticated.
        const db = drizzle(env.DB);
        const authorization = await db
            .select()
            .from(serviceAuthorization)
            .where(eq(serviceAuthorization.requestId, upload.id))
            .get();
        expect(authorization).toMatchObject({
            service: "media.pollinations.ai",
            requestPath: "/upload",
            userId: "user_alice",
            byopClientKeyId: keys.appKeyId,
        });

        // Exactly one settled zero-price billing event.
        const events = await db
            .select()
            .from(serviceBillingEvent)
            .where(
                eq(
                    serviceBillingEvent.authorizationId,
                    (authorization as { id: string }).id,
                ),
            );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventId: "upload",
            eventType: "media.upload",
            status: "settled",
            price: 0,
            billedPrice: 0,
        });

        // And exactly one analytics row for it left Enter.
        const rows = mocks.tinybird.state.events.filter(
            (row) => row.requestId === upload.id,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            eventType: "media.upload",
            userId: "user_alice",
            totalPrice: 0,
        });
    });

    describe("upload settlement", () => {
        async function stateFor(id: string) {
            const db = drizzle(env.DB);
            const authorization = await db
                .select()
                .from(serviceAuthorization)
                .where(eq(serviceAuthorization.requestId, id))
                .get();
            const events = authorization
                ? await db
                      .select()
                      .from(serviceBillingEvent)
                      .where(
                          eq(
                              serviceBillingEvent.authorizationId,
                              authorization.id,
                          ),
                      )
                : [];
            const catalogRows = await db
                .select({ id: mediaItem.id })
                .from(mediaItem)
                .where(eq(mediaItem.id, id));
            const tagRows = await db
                .select({ tag: mediaTag.tag })
                .from(mediaTag)
                .where(eq(mediaTag.itemId, id));
            return {
                authorization,
                events,
                catalogRows,
                tagRows,
                object: sharedBucket.getObject(id),
                analyticsRows: mocks.tinybird.state.events.filter(
                    (row) => row.requestId === id,
                ),
            };
        }

        // The only authorization this isolated test created: the failed
        // upload never returns its id, so the ledger is how a test finds it.
        async function onlyRequestId(): Promise<string> {
            const rows = await drizzle(env.DB)
                .select({ requestId: serviceAuthorization.requestId })
                .from(serviceAuthorization);
            expect(rows).toHaveLength(1);
            return rows[0].requestId;
        }

        it("re-delivers the identical settlement once when the first ack is lost", async () => {
            // Every delivery reaches Enter. The first one commits, then its
            // acknowledgement is lost on the way back; the second identical
            // delivery is Enter's real duplicate response.
            let calls = 0;
            const results: ServiceSettleResult[] = [];
            const gateway: ServiceGatewayBinding = {
                ...enterGateway,
                settle: async (input) => {
                    calls += 1;
                    const result = await enterGateway.settle(input);
                    results.push(result);
                    if (calls === 1) throw new Error("rpc ack lost");
                    return result;
                },
            };
            const { status, body } = await uploadViaForm(keys.pkAlice, {
                fileName: "ack-lost.png",
                bytes: variant(50),
                tags: ["ack-lost"],
                gateway,
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            expect(calls).toBe(2);
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({
                ok: true,
                settled: ["upload"],
                duplicates: [],
            });
            expect(results[1]).toEqual({
                ok: true,
                settled: [],
                duplicates: ["upload"],
            });

            const state = await stateFor(upload.id);
            expect(state.events).toHaveLength(1);
            expect(state.events[0]).toMatchObject({ status: "settled" });
            expect(state.analyticsRows).toHaveLength(1);
            expect(state.catalogRows).toHaveLength(1);
            expect(state.object).toBeDefined();
        });

        it("rolls back storage and catalog when Enter refuses the settlement", async () => {
            // Enter's own engine refuses once the authorization is gone
            // (canceled here): the refusal is final and never retried.
            let calls = 0;
            const gateway: ServiceGatewayBinding = {
                ...enterGateway,
                settle: async (input) => {
                    calls += 1;
                    await enterGateway.cancel(input.authorizationId);
                    return enterGateway.settle(input);
                },
            };
            const { status } = await uploadViaForm(keys.pkAlice, {
                fileName: "refused.png",
                bytes: variant(51),
                tags: ["refused"],
                gateway,
            });
            expect(status).toBe(500);
            expect(calls).toBe(1);

            const state = await stateFor(await onlyRequestId());
            expect(state.authorization?.canceledAt).not.toBeNull();
            expect(state.events).toHaveLength(0);
            expect(state.analyticsRows).toHaveLength(0);
            expect(state.catalogRows).toHaveLength(0);
            expect(state.tagRows).toHaveLength(0);
            expect(state.object).toBeUndefined();

            const galleryRes = await fetchApp(
                "https://media.pollinations.ai/media?tag=refused",
            );
            expect(
                ((await galleryRes.json()) as MediaPageResponse).items,
            ).toEqual([]);
        });

        it("rolls back and cancels when the settlement binding keeps failing", async () => {
            let calls = 0;
            const gateway: ServiceGatewayBinding = {
                ...enterGateway,
                settle: async () => {
                    calls += 1;
                    throw new Error("rpc unavailable");
                },
            };
            const { status } = await uploadViaForm(keys.pkAlice, {
                fileName: "unavailable.png",
                bytes: variant(52),
                tags: ["unavailable"],
                gateway,
            });
            expect(status).toBe(500);
            expect(calls).toBe(2);

            const state = await stateFor(await onlyRequestId());
            expect(state.authorization?.canceledAt).not.toBeNull();
            expect(state.events).toHaveLength(0);
            expect(state.catalogRows).toHaveLength(0);
            expect(state.tagRows).toHaveLength(0);
            expect(state.object).toBeUndefined();
        });
    });

    describe("agent run tokens", () => {
        const runToken = () =>
            signAgentRunToken({
                secret: gatewayEnv.BETTER_AUTH_SECRET,
                parentApiKeyId: keys.skAliceId,
                parentRequestId: crypto.randomUUID(),
            });

        it("rejects ag_ in the query string with 401 before consulting Enter", async () => {
            const { status } = await uploadViaForm("", {
                fileName: "query-ag.png",
                bytes: variant(60),
                query: `?key=${encodeURIComponent(await runToken())}`,
            });
            expect(status).toBe(401);

            const authorizations = await drizzle(env.DB)
                .select()
                .from(serviceAuthorization);
            expect(authorizations).toHaveLength(0);
        });

        it("uploads with a Bearer ag_ token on behalf of the parent key's owner", async () => {
            const { status, body } = await uploadViaForm(await runToken(), {
                fileName: "bearer-ag.png",
                bytes: variant(61),
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;

            const authorization = await drizzle(env.DB)
                .select()
                .from(serviceAuthorization)
                .where(eq(serviceAuthorization.requestId, upload.id))
                .get();
            expect(authorization).toMatchObject({
                userId: "user_alice",
                apiKeyId: keys.skAliceId,
            });
        });

        it("cannot delete published media; the owner's secret key still can", async () => {
            const { status, body } = await uploadViaForm(keys.skAlice, {
                fileName: "delete-ag.png",
                bytes: variant(62),
                tags: ["delete-ag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const url = `https://media.pollinations.ai/media/${upload.id}`;

            const delegated = await fetchApp(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${await runToken()}` },
            });
            expect(delegated.status).toBe(403);

            // Nothing was removed.
            expect(sharedBucket.getObject(upload.id)).toBeDefined();
            const galleryRes = await fetchApp(
                "https://media.pollinations.ai/media?tag=delete-ag",
            );
            expect(
                ((await galleryRes.json()) as MediaPageResponse).items.map(
                    (item) => item.id,
                ),
            ).toEqual([upload.id]);

            const owner = await fetchApp(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${keys.skAlice}` },
            });
            expect(owner.status).toBe(200);
            expect(sharedBucket.getObject(upload.id)).toBeUndefined();
        });
    });

    it("maps Enter denials onto the upload response", async () => {
        const banned = await uploadViaForm(keys.pkBanned, {
            fileName: "banned.png",
            bytes: variant(9),
        });
        expect(banned.status).toBe(403);

        // Negative balances in both buckets fail even a zero-cost preflight.
        const broke = await uploadViaForm(keys.pkBroke, {
            fileName: "broke.png",
            bytes: variant(12),
        });
        expect(broke.status).toBe(402);

        // Denied requests must not authorize or settle anything.
        const db = drizzle(env.DB);
        const authorizations = await db.select().from(serviceAuthorization);
        expect(authorizations).toHaveLength(0);
        const events = await db.select().from(serviceBillingEvent);
        expect(events).toHaveLength(0);
    });

    it("re-uploading the same bytes creates a distinct item, not a merge", async () => {
        const first = await uploadViaForm(keys.pkAlice, {
            fileName: "merge.png",
            bytes: variant(10),
            tags: ["first-tag"],
        });
        expect(first.status).toBe(200);
        const firstUpload = first.body as UploadResponse;

        const second = await uploadViaForm(keys.pkAlice, {
            fileName: "merge.png",
            bytes: variant(10),
            tags: ["second-tag"],
        });
        expect(second.status).toBe(200);
        const secondUpload = second.body as UploadResponse;
        // Each upload is its own item now (no content dedup).
        expect(secondUpload.id).not.toBe(firstUpload.id);

        // Each item lands only in its own tag's gallery.
        const firstGallery = (await (
            await fetchApp("https://media.pollinations.ai/media?tag=first-tag")
        ).json()) as MediaPageResponse;
        expect(firstGallery.items.map((i) => i.url)).toContain(firstUpload.url);
        expect(firstGallery.items.map((i) => i.url)).not.toContain(
            secondUpload.url,
        );

        const secondGallery = (await (
            await fetchApp("https://media.pollinations.ai/media?tag=second-tag")
        ).json()) as MediaPageResponse;
        expect(secondGallery.items.map((i) => i.url)).toContain(
            secondUpload.url,
        );
        expect(secondGallery.items.map((i) => i.url)).not.toContain(
            firstUpload.url,
        );
    });

    it("galleries order by upload time (createdAt)", async () => {
        const tag = "order-tag";
        const first = await uploadViaForm(keys.pkAlice, {
            fileName: "order-a.png",
            bytes: variant(60),
            tags: [tag],
        });
        const second = await uploadViaForm(keys.pkAlice, {
            fileName: "order-b.png",
            bytes: variant(61),
            tags: [tag],
        });
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const a = first.body as UploadResponse;
        const b = second.body as UploadResponse;

        // Backdate deterministically: a older than b. The upload id is the
        // item id, so update the row directly. Ordering is by createdAt.
        const db = drizzle(env.DB);
        const backdate = async (id: string, epochSeconds: number) => {
            await db
                .update(mediaItem)
                .set({ createdAt: new Date(epochSeconds * 1000) })
                .where(eq(mediaItem.id, id));
        };
        await backdate(a.id, 1000);
        await backdate(b.id, 2000);

        const galleryRes = await fetchApp(
            `https://media.pollinations.ai/media?tag=${tag}`,
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        const urls = gallery.items.map((i) => i.url);
        expect(urls).toEqual([b.url, a.url]);
        const aItem = gallery.items.find((i) => i.url === a.url);
        expect(new Date(aItem?.createdAt as string).getTime()).toBe(1000_000);
    });

    it("paginates a tag gallery newest-first with a keyset cursor", async () => {
        const tag = "pagination-tag";
        const uploads: UploadResponse[] = [];
        for (let i = 0; i < 3; i++) {
            const { status, body } = await uploadViaForm(keys.pkAlice, {
                fileName: `page-${i}.png`,
                bytes: variant(20 + i),
                tags: [tag],
            });
            expect(status).toBe(200);
            uploads.push(body as UploadResponse);
        }

        // Uploads can land within the same wall-clock second (createdAt is
        // second-resolution), which would make "newest first" ambiguous.
        // Force distinct, strictly increasing timestamps directly in D1 so
        // the ordering assertions below are deterministic. The gallery sorts
        // by upload time (mediaItem.created_at).
        const db = drizzle(env.DB);
        for (let i = 0; i < uploads.length; i++) {
            const when = new Date((1000 + i) * 1000);
            await db
                .update(mediaItem)
                .set({ createdAt: when })
                .where(eq(mediaItem.id, uploads[i].id));
        }

        const page1Res = await fetchApp(
            `https://media.pollinations.ai/media?tag=${tag}&limit=2`,
        );
        expect(page1Res.status).toBe(200);
        const page1 = (await page1Res.json()) as MediaPageResponse;
        expect(page1.items).toHaveLength(2);
        expect(page1.nextCursor).not.toBeNull();
        expect(page1.hasMore).toBe(true);
        // Newest first: the most recently uploaded item leads the page.
        expect(page1.items[0].url).toBe(uploads[2].url);
        expect(page1.items[1].url).toBe(uploads[1].url);

        const page2Res = await fetchApp(
            `https://media.pollinations.ai/media?tag=${tag}&limit=2&cursor=${encodeURIComponent(
                page1.nextCursor as string,
            )}`,
        );
        expect(page2Res.status).toBe(200);
        const page2 = (await page2Res.json()) as MediaPageResponse;
        expect(page2.items).toHaveLength(1);
        expect(page2.items[0].url).toBe(uploads[0].url);
        expect(page2.nextCursor).toBeNull();
        expect(page2.hasMore).toBe(false);
    });

    it("validates the limit query param: valid passes, malformed 400s", async () => {
        // A well-formed integer limit is accepted.
        const ok = await fetchApp(
            "https://media.pollinations.ai/media?tag=sunset&limit=10",
        );
        expect(ok.status).toBe(200);

        // Non-numeric, out-of-range, and repeated (hono flattens repeats to an
        // array) limits are malformed scalar params → 400 in {error} shape.
        for (const q of [
            "limit=abc",
            "limit=0",
            "limit=1000",
            "limit=1&limit=2",
        ]) {
            const res = await fetchApp(
                `https://media.pollinations.ai/media?tag=sunset&${q}`,
            );
            expect(res.status, q).toBe(400);
            const body = (await res.json()) as { error: string };
            expect(body.error, q).toContain("limit");
        }

        // A garbage cursor is a 400 in the same {error} shape, not a 500.
        const badCursor = await fetchApp(
            "https://media.pollinations.ai/media?tag=sunset&cursor=not-a-cursor",
        );
        expect(badCursor.status).toBe(400);
        expect(((await badCursor.json()) as { error: string }).error).toContain(
            "cursor",
        );
    });

    it("GET /media requires a tag; galleries need no auth at all", async () => {
        // No tag → 400 in the same {error} shape as every other error.
        const noTag = await fetchApp("https://media.pollinations.ai/media");
        expect(noTag.status).toBe(400);
        const noTagBody = (await noTag.json()) as { error: string };
        expect(noTagBody.error).toContain("tag");

        // A whitespace-only tag normalizes to empty → also 400.
        const emptyTag = await fetchApp(
            "https://media.pollinations.ai/media?tag=%20",
        );
        expect(emptyTag.status).toBe(400);

        // A tag gallery is browsable with no key at all.
        const publicGallery = await fetchApp(
            "https://media.pollinations.ai/media?tag=sunset",
        );
        expect(publicGallery.status).toBe(200);
    });

    describe("DELETE /media/:id", () => {
        it("owner deletes with a secret key: unpublished and gone", async () => {
            const { status, body } = await uploadViaForm(keys.pkAlice, {
                fileName: "delete-me.png",
                bytes: variant(40),
                tags: ["delete-flow-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;

            const delRes = await fetchApp(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${keys.skAlice}` },
                },
            );
            expect(delRes.status).toBe(200);
            expect(await delRes.json()).toEqual({
                deleted: true,
                id: upload.id,
            });

            // Gone from the gallery…
            const galleryRes = await fetchApp(
                "https://media.pollinations.ai/media?tag=delete-flow-tag",
            );
            const gallery = (await galleryRes.json()) as MediaPageResponse;
            expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);

            // …its URL 404s…
            const getRes = await fetchApp(
                `https://media.pollinations.ai/${upload.id}`,
            );
            expect(getRes.status).toBe(404);

            // …and the catalog rows (item + tags) are gone.
            const db = drizzle(env.DB);
            const itemRows = await db
                .select({ id: mediaItem.id })
                .from(mediaItem)
                .where(eq(mediaItem.id, upload.id));
            expect(itemRows).toHaveLength(0);
            const tagRows = await db
                .select({ tag: mediaTag.tag })
                .from(mediaTag)
                .where(eq(mediaTag.itemId, upload.id));
            expect(tagRows).toHaveLength(0);

            // Repeat delete: the item no longer exists → 404.
            const again = await fetchApp(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${keys.skAlice}` },
                },
            );
            expect(again.status).toBe(404);
        });

        it("rejects non-owners, publishable keys, and missing/invalid keys", async () => {
            const { status, body } = await uploadViaForm(keys.pkAlice, {
                fileName: "delete-authz.png",
                bytes: variant(41),
                tags: ["delete-authz-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const url = `https://media.pollinations.ai/media/${upload.id}`;

            const noKey = await fetchApp(url, { method: "DELETE" });
            expect(noKey.status).toBe(401);

            const unknownKey = await fetchApp(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer pk_unknown" },
            });
            expect(unknownKey.status).toBe(401);

            // Publishable keys ship inside public clients — anyone holding
            // one must not be able to delete the owner's published media.
            const publishable = await fetchApp(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${keys.pkAlice}` },
            });
            expect(publishable.status).toBe(403);

            const nonOwner = await fetchApp(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${keys.skBob}` },
            });
            expect(nonOwner.status).toBe(403);

            // None of the failed attempts deleted anything.
            const getRes = await fetchApp(
                `https://media.pollinations.ai/${upload.id}`,
            );
            expect(getRes.status).toBe(200);
            await getRes.arrayBuffer();
        });

        it("unknown and uncataloged (untagged) ids answer 404", async () => {
            const unknown = await fetchApp(
                `https://media.pollinations.ai/media/${crypto.randomUUID()}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${keys.skAlice}` },
                },
            );
            expect(unknown.status).toBe(404);

            // An untagged upload was never published: no catalog row, no
            // owner record to authorize a delete against → 404, blob stays.
            const { status, body } = await uploadViaForm(keys.pkAlice, {
                fileName: "delete-untagged.png",
                bytes: variant(42),
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;

            const res = await fetchApp(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${keys.skAlice}` },
                },
            );
            expect(res.status).toBe(404);

            const getRes = await fetchApp(
                `https://media.pollinations.ai/${upload.id}`,
            );
            expect(getRes.status).toBe(200);
            await getRes.arrayBuffer();
        });
    });

    it("serves a full page at limit=100 (D1 bound-parameter cap regression)", async () => {
        const db = drizzle(env.DB);
        const now = Date.now();
        const rows = Array.from({ length: 101 }, (_, i) => ({
            id: `bulk-${i}-${crypto.randomUUID()}`,
            ownerUserId: "user_bob",
            appKeyId: null,
            contentType: "image/png",
            size: 67,
            createdAt: new Date(now + i),
        }));
        // Insert in slices — a single 101-row VALUES would itself blow the
        // 100-bound-parameter cap this test guards against.
        for (let i = 0; i < rows.length; i += 10) {
            await db.insert(mediaItem).values(rows.slice(i, i + 10));
            await db
                .insert(mediaTag)
                .values(
                    rows
                        .slice(i, i + 10)
                        .map((row) => ({ itemId: row.id, tag: "bulk" })),
                );
        }

        const res = await fetchApp(
            "https://media.pollinations.ai/media?tag=bulk&limit=100",
        );
        expect(res.status).toBe(200);
        const page = (await res.json()) as MediaPageResponse;
        expect(page.items).toHaveLength(100);
        expect(page.hasMore).toBe(true);
    });
});
