import {
    createExecutionContext,
    env,
    fetchMock,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { mediaItem, mediaTag } from "@shared/db/media-catalog.ts";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";

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

// Kept for the pre-existing tests that don't care about identity.
const VALID_KEY = "pk_alice";

const KEY_IDENTITIES: Record<
    string,
    {
        valid: boolean;
        type?: string;
        name?: string | null;
        userId?: string | null;
        byopClientKeyId?: string | null;
    }
> = {
    pk_alice: {
        valid: true,
        type: "publishable",
        name: "alice-key",
        userId: "user_alice",
        byopClientKeyId: "pk_app_1",
    },
    pk_bob: {
        valid: true,
        type: "publishable",
        name: "bob-key",
        userId: "user_bob",
        byopClientKeyId: null,
    },
    pk_nouser: {
        valid: true,
        type: "publishable",
        name: "service-key",
        userId: null,
        byopClientKeyId: null,
    },
    // Deleting media is secret-key only, so delete tests use these.
    sk_alice: {
        valid: true,
        type: "secret",
        name: "alice-secret",
        userId: "user_alice",
        byopClientKeyId: null,
    },
    sk_bob: {
        valid: true,
        type: "secret",
        name: "bob-secret",
        userId: "user_bob",
        byopClientKeyId: null,
    },
    // The response shape of an enter deployment that predates the identity
    // fields — userId/byopClientKeyId entirely absent, not null.
    sk_legacy: {
        valid: true,
        type: "secret",
        name: "legacy-key",
    },
};

function createMediaEnv(bucket = createTestR2Bucket()) {
    return {
        MEDIA_BUCKET: bucket,
        MAX_FILE_SIZE: "52428800",
        DB: env.DB,
    };
}

function mockAuth() {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({ path: "/account/key" })
        .reply(({ headers }) => {
            const headerBag = headers as Record<string, string>;
            const authHeader =
                headerBag.authorization ?? headerBag.Authorization ?? "";
            const key = authHeader.replace(/^Bearer /, "");
            const identity = KEY_IDENTITIES[key];
            if (!identity) {
                return {
                    statusCode: 200,
                    data: JSON.stringify({ valid: false }),
                    responseOptions: {
                        headers: { "content-type": "application/json" },
                    },
                };
            }
            return {
                statusCode: 200,
                data: JSON.stringify(identity),
                responseOptions: {
                    headers: { "content-type": "application/json" },
                },
            };
        })
        .persist();
}

async function seedUsers() {
    const db = drizzle(env.DB);
    const now = new Date();
    for (const id of ["user_alice", "user_bob"]) {
        await db
            .insert(userTable)
            .values({
                id,
                name: id,
                email: `${id}@test.com`,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoNothing({ target: userTable.id });
    }
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

    const res = await SELF.fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json()) as UploadResponse | { error: string };
    return { status: res.status, body };
}

describe("media.pollinations.ai", () => {
    beforeAll(async () => {
        await seedUsers();
    });

    beforeEach(() => {
        mockAuth();
    });

    afterEach(() => {
        fetchMock.deactivate();
    });

    it("GET / returns service info", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/");
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.service).toBe("media.pollinations.ai");
    });

    it("POST /upload without key returns 401", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
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

        const uploadRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(upload.id).not.toBe("");
        expect(upload.url).toContain(upload.id);
        expect(upload.contentType).toBe("image/png");
        expect(upload.size).toBe(TINY_PNG.length);

        // Retrieve — check Content-Disposition
        const getRes = await SELF.fetch(
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
        const headRes = await SELF.fetch(
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
        const dupRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: dupForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const dup = (await dupRes.json()) as UploadResponse;
        expect(dup.id).not.toBe(upload.id);
    });

    it("uploads via base64 JSON", async () => {
        const base64 = btoa(String.fromCharCode(...TINY_PNG));
        const uploadRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${VALID_KEY}`,
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

        const getRes = await SELF.fetch(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        const body = new Uint8Array(await getRes.arrayBuffer());
        expect(body.length).toBe(TINY_PNG.length);
    });

    it("rejects an unsupported upload content type with 400", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: TINY_PNG,
            headers: {
                Authorization: `Bearer ${VALID_KEY}`,
                "Content-Type": "image/png",
            },
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("multipart/form-data");
    });

    it("rejects empty files, invalid base64, and malformed JSON with 400", async () => {
        const emptyForm = new FormData();
        emptyForm.append(
            "file",
            new File([], "empty.png", { type: "image/png" }),
        );
        const emptyRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: emptyForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(emptyRes.status).toBe(400);

        const badBase64 = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${VALID_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ data: "!!!not-base64!!!" }),
            },
        );
        expect(badBase64.status).toBe(400);

        const badJson = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${VALID_KEY}`,
                    "Content-Type": "application/json",
                },
                body: "{not json",
            },
        );
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
                headers: { Authorization: `Bearer ${VALID_KEY}` },
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

        const res1 = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form1,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const res2 = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form2,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });

        const upload1 = (await res1.json()) as UploadResponse;
        const upload2 = (await res2.json()) as UploadResponse;
        expect(upload1.id).not.toBe(upload2.id);
    });

    it("GET /:nonexistent-id returns 404", async () => {
        const res = await SELF.fetch(
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
        const { status, body } = await uploadViaForm("pk_alice", {
            fileName: "gallery-a.png",
            bytes: variant(1),
            tags: ["Sunset "],
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;
        expect(upload.tags).toEqual(["sunset"]);

        const galleryRes = await SELF.fetch(
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
        const upperRes = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=SUNSET",
        );
        expect(upperRes.status).toBe(200);
        const upperGallery = (await upperRes.json()) as MediaPageResponse;
        expect(upperGallery.items.map((i) => i.url)).toContain(upload.url);
    });

    it("untagged upload is not cataloged: unlisted but retrievable", async () => {
        const { status, body } = await uploadViaForm("pk_alice", {
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

        const galleryRes = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=some-other-tag",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);

        // The blob itself is still retrievable by its unguessable id.
        // (Consume the body: an unread R2 stream keeps storage handles open
        // and trips vitest-pool-workers' isolated-storage stacking.)
        const getRes = await SELF.fetch(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        await getRes.arrayBuffer();
    });

    it("stamps owner and app from the verified key, ignoring spoofed form fields", async () => {
        const alice = await uploadViaForm("pk_alice", {
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

        // The catalog row carries the identity attested by /account/key —
        // pk_alice → user_alice via app pk_app_1 — not the form fields.
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
            appKeyId: "pk_app_1",
        });
    });

    it("rejects invalid tags with 400", async () => {
        const upperCase = await uploadViaForm("pk_alice", {
            fileName: "bad-tag-1.png",
            bytes: variant(5),
            tags: ["UPPER CASE!"],
        });
        expect(upperCase.status).toBe(400);
        expect((upperCase.body as { error: string }).error).toMatch(
            /UPPER CASE!/,
        );

        const leadingDash = await uploadViaForm("pk_alice", {
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
        const res = await uploadViaForm("pk_alice", {
            fileName: "singular-tag-ignored.png",
            bytes: variant(30),
            extraFields: { tag: "legacy" },
        });
        expect(res.status).toBe(200);
        const upload = res.body as UploadResponse;
        expect(upload.tags).toBeUndefined();

        const galleryRes = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=legacy",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);
    });

    it("rejects more than 8 tags with 400", async () => {
        const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
        const res = await uploadViaForm("pk_alice", {
            fileName: "too-many-tags.png",
            bytes: variant(7),
            tags,
        });
        expect(res.status).toBe(400);
    });

    it("keys without a user can't publish, but plain uploads still work", async () => {
        const withTag = await uploadViaForm("pk_nouser", {
            fileName: "nouser-tagged.png",
            bytes: variant(8),
            tags: ["should-fail"],
        });
        expect(withTag.status).toBe(400);
        expect((withTag.body as { error: string }).error).toMatch(
            /requires a user-owned API key/,
        );

        const plain = await uploadViaForm("pk_nouser", {
            fileName: "nouser-plain.png",
            bytes: variant(9),
        });
        expect(plain.status).toBe(200);
        const upload = plain.body as UploadResponse;
        expect(upload.tags).toBeUndefined();

        // An /account/key response predating the identity fields (userId
        // absent, not null) must read as not-user-attached: same behavior.
        const legacyTagged = await uploadViaForm("sk_legacy", {
            fileName: "legacy-tagged.png",
            bytes: variant(11),
            tags: ["should-fail"],
        });
        expect(legacyTagged.status).toBe(400);

        const legacyPlain = await uploadViaForm("sk_legacy", {
            fileName: "legacy-plain.png",
            bytes: variant(12),
        });
        expect(legacyPlain.status).toBe(200);
        const legacyUpload = legacyPlain.body as UploadResponse;
        const db = drizzle(env.DB);
        const rows = await db
            .select({ id: mediaItem.id })
            .from(mediaItem)
            .where(eq(mediaItem.id, legacyUpload.id));
        expect(rows).toHaveLength(0);
    });

    it("re-uploading the same bytes creates a distinct item, not a merge", async () => {
        const first = await uploadViaForm("pk_alice", {
            fileName: "merge.png",
            bytes: variant(10),
            tags: ["first-tag"],
        });
        expect(first.status).toBe(200);
        const firstUpload = first.body as UploadResponse;

        const second = await uploadViaForm("pk_alice", {
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
            await SELF.fetch(
                "https://media.pollinations.ai/media?tag=first-tag",
            )
        ).json()) as MediaPageResponse;
        expect(firstGallery.items.map((i) => i.url)).toContain(firstUpload.url);
        expect(firstGallery.items.map((i) => i.url)).not.toContain(
            secondUpload.url,
        );

        const secondGallery = (await (
            await SELF.fetch(
                "https://media.pollinations.ai/media?tag=second-tag",
            )
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
        const first = await uploadViaForm("pk_alice", {
            fileName: "order-a.png",
            bytes: variant(60),
            tags: [tag],
        });
        const second = await uploadViaForm("pk_alice", {
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

        const galleryRes = await SELF.fetch(
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
            const { status, body } = await uploadViaForm("pk_alice", {
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

        const page1Res = await SELF.fetch(
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

        const page2Res = await SELF.fetch(
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
        const ok = await SELF.fetch(
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
            const res = await SELF.fetch(
                `https://media.pollinations.ai/media?tag=sunset&${q}`,
            );
            expect(res.status, q).toBe(400);
            const body = (await res.json()) as { error: string };
            expect(body.error, q).toContain("limit");
        }

        // A garbage cursor is a 400 in the same {error} shape, not a 500.
        const badCursor = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=sunset&cursor=not-a-cursor",
        );
        expect(badCursor.status).toBe(400);
        expect(((await badCursor.json()) as { error: string }).error).toContain(
            "cursor",
        );
    });

    it("GET /media requires a tag; galleries need no auth at all", async () => {
        // No tag → 400 in the same {error} shape as every other error.
        const noTag = await SELF.fetch("https://media.pollinations.ai/media");
        expect(noTag.status).toBe(400);
        const noTagBody = (await noTag.json()) as { error: string };
        expect(noTagBody.error).toContain("tag");

        // A whitespace-only tag normalizes to empty → also 400.
        const emptyTag = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=%20",
        );
        expect(emptyTag.status).toBe(400);

        // A tag gallery is browsable with no key at all.
        const publicGallery = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=sunset",
        );
        expect(publicGallery.status).toBe(200);
    });

    describe("DELETE /media/:id", () => {
        it("owner deletes with a secret key: unpublished and gone", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "delete-me.png",
                bytes: variant(40),
                tags: ["delete-flow-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;

            const delRes = await SELF.fetch(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer sk_alice" },
                },
            );
            expect(delRes.status).toBe(200);
            expect(await delRes.json()).toEqual({
                deleted: true,
                id: upload.id,
            });

            // Gone from the gallery…
            const galleryRes = await SELF.fetch(
                "https://media.pollinations.ai/media?tag=delete-flow-tag",
            );
            const gallery = (await galleryRes.json()) as MediaPageResponse;
            expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);

            // …its URL 404s…
            const getRes = await SELF.fetch(
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
            const again = await SELF.fetch(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer sk_alice" },
                },
            );
            expect(again.status).toBe(404);
        });

        it("rejects non-owners, publishable keys, and missing/invalid keys", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "delete-authz.png",
                bytes: variant(41),
                tags: ["delete-authz-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const url = `https://media.pollinations.ai/media/${upload.id}`;

            const noKey = await SELF.fetch(url, { method: "DELETE" });
            expect(noKey.status).toBe(401);

            const unknownKey = await SELF.fetch(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer pk_unknown" },
            });
            expect(unknownKey.status).toBe(401);

            // Publishable keys ship inside public clients — anyone holding
            // one must not be able to delete the owner's published media.
            const publishable = await SELF.fetch(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer pk_alice" },
            });
            expect(publishable.status).toBe(403);

            const nonOwner = await SELF.fetch(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer sk_bob" },
            });
            expect(nonOwner.status).toBe(403);

            // A valid key with no attached user has no library to own.
            const noUser = await SELF.fetch(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer pk_nouser" },
            });
            expect(noUser.status).toBe(403);

            // An /account/key response predating the identity fields (userId
            // absent, not null) must read as not-user-attached — the `?? null`
            // normalization guard, exercised on the delete path.
            const legacy = await SELF.fetch(url, {
                method: "DELETE",
                headers: { Authorization: "Bearer sk_legacy" },
            });
            expect(legacy.status).toBe(403);

            // None of the failed attempts deleted anything.
            const getRes = await SELF.fetch(
                `https://media.pollinations.ai/${upload.id}`,
            );
            expect(getRes.status).toBe(200);
            await getRes.arrayBuffer();
        });

        it("unknown and uncataloged (untagged) ids answer 404", async () => {
            const unknown = await SELF.fetch(
                `https://media.pollinations.ai/media/${crypto.randomUUID()}`,
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer sk_alice" },
                },
            );
            expect(unknown.status).toBe(404);

            // An untagged upload was never published: no catalog row, no
            // owner record to authorize a delete against → 404, blob stays.
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "delete-untagged.png",
                bytes: variant(42),
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;

            const res = await SELF.fetch(
                `https://media.pollinations.ai/media/${upload.id}`,
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer sk_alice" },
                },
            );
            expect(res.status).toBe(404);

            const getRes = await SELF.fetch(
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

        const res = await SELF.fetch(
            "https://media.pollinations.ai/media?tag=bulk&limit=100",
        );
        expect(res.status).toBe(200);
        const page = (await res.json()) as MediaPageResponse;
        expect(page.items).toHaveLength(100);
        expect(page.hasMore).toBe(true);
    });
});
