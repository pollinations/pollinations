import {
    createExecutionContext,
    env,
    fetchMock,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { mediaItem } from "@shared/db/media-catalog.ts";
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
    duplicate: boolean;
    tags?: string[];
}

interface MediaItemResponse {
    id: string;
    url: string;
    kind: string;
    contentType: string;
    size: number | null;
    tags: string[];
    prompt: string | null;
    model: string | null;
    createdAt: string;
    reactions: Record<string, number>;
    myReactions?: string[];
}

interface MediaPageResponse {
    items: MediaItemResponse[];
    nextCursor: string | null;
}

interface ReactionResponse {
    reaction: string;
    reacted: boolean;
    count: number;
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
        keyId?: string;
        byopClientKeyId?: string | null;
    }
> = {
    pk_alice: {
        valid: true,
        type: "publishable",
        name: "alice-key",
        userId: "user_alice",
        keyId: "key_alice",
        byopClientKeyId: "pk_app_1",
    },
    pk_bob: {
        valid: true,
        type: "publishable",
        name: "bob-key",
        userId: "user_bob",
        keyId: "key_bob",
        byopClientKeyId: null,
    },
    pk_nouser: {
        valid: true,
        type: "publishable",
        name: "service-key",
        userId: null,
        keyId: "key_svc",
        byopClientKeyId: null,
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

// Distinct byte content per upload so hashes (and therefore catalog rows)
// differ even when reusing the same base PNG.
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
        prompt?: string;
        model?: string;
        extraFields?: Record<string, string>;
    } = {},
): Promise<{ status: number; body: UploadResponse | { error: string } }> {
    const form = new FormData();
    form.append(
        "file",
        pngFile(options.fileName ?? "test.png", options.bytes ?? TINY_PNG),
    );
    for (const tag of options.tags ?? []) {
        form.append("tag", tag);
    }
    if (options.prompt) form.append("prompt", options.prompt);
    if (options.model) form.append("model", options.model);
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

    it("upload, retrieve, and deduplicate", async () => {
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
        expect(upload.id).toMatch(/^[a-f0-9]{16}$/);
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
        expect(headRes.headers.get("x-content-hash")).toBe(upload.id);

        // Duplicate re-upload returns same hash
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
        expect(dup.id).toBe(upload.id);
        expect(dup.duplicate).toBe(true);
    });

    it("refreshes uploaded media TTL on aged GET", async () => {
        const bucket = createTestR2Bucket();
        const mediaEnv = createMediaEnv(bucket);
        const uploadCtx = createExecutionContext();

        const uploadRes = await app.fetch(
            new Request("https://media.pollinations.ai/upload", {
                method: "POST",
                body: TINY_PNG,
                headers: {
                    Authorization: `Bearer ${VALID_KEY}`,
                    "Content-Type": "image/png",
                },
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

    it("same content with different filename produces different hash", async () => {
        const form1 = new FormData();
        form1.append(
            "file",
            new File([TINY_PNG], "a.png", { type: "image/png" }),
        );
        const form2 = new FormData();
        form2.append(
            "file",
            new File([TINY_PNG], "b.png", { type: "image/png" }),
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

    it("GET /:invalid-hash returns 400", async () => {
        const res = await SELF.fetch(
            "https://media.pollinations.ai/not-a-valid-hash",
        );
        expect(res.status).toBe(400);
    });

    it("GET /:nonexistent-hash returns 404", async () => {
        const res = await SELF.fetch(
            "https://media.pollinations.ai/0000000000000000",
        );
        expect(res.status).toBe(404);
    });

    it("tagged upload is visible in public tag gallery and in /me/media, without owner fields", async () => {
        const { status, body } = await uploadViaForm("pk_alice", {
            fileName: "gallery-a.png",
            bytes: variant(1),
            tags: ["Sunset "],
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;
        expect(upload.tags).toEqual(["sunset"]);

        const galleryRes = await SELF.fetch(
            "https://media.pollinations.ai/tags/sunset",
        );
        expect(galleryRes.status).toBe(200);
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).toContain(upload.url);
        for (const item of gallery.items) {
            expect(item).not.toHaveProperty("ownerUserId");
            expect(item).not.toHaveProperty("appKeyId");
        }

        const meRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            {
                headers: { Authorization: "Bearer pk_alice" },
            },
        );
        expect(meRes.status).toBe(200);
        const me = (await meRes.json()) as MediaPageResponse;
        expect(me.items.map((i) => i.url)).toContain(upload.url);
        for (const item of me.items) {
            expect(item).not.toHaveProperty("ownerUserId");
            expect(item).not.toHaveProperty("appKeyId");
        }
    });

    it("untagged upload appears in /me/media but not in an unrelated tag gallery", async () => {
        const { status, body } = await uploadViaForm("pk_alice", {
            fileName: "untagged.png",
            bytes: variant(2),
        });
        expect(status).toBe(200);
        const upload = body as UploadResponse;
        expect(upload.tags).toBeUndefined();

        const meRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            {
                headers: { Authorization: "Bearer pk_alice" },
            },
        );
        const me = (await meRes.json()) as MediaPageResponse;
        expect(me.items.map((i) => i.url)).toContain(upload.url);

        const galleryRes = await SELF.fetch(
            "https://media.pollinations.ai/tags/some-other-tag",
        );
        const gallery = (await galleryRes.json()) as MediaPageResponse;
        expect(gallery.items.map((i) => i.url)).not.toContain(upload.url);
    });

    it("ignores spoofed identity fields in the upload form", async () => {
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

        const bob = await uploadViaForm("pk_bob", {
            fileName: "spoof-bob.png",
            bytes: variant(4),
            tags: ["spoof-test"],
        });
        expect(bob.status).toBe(200);
        const bobUpload = bob.body as UploadResponse;

        const aliceMediaRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            { headers: { Authorization: "Bearer pk_alice" } },
        );
        const aliceMedia = (await aliceMediaRes.json()) as MediaPageResponse;
        const aliceUrls = aliceMedia.items.map((i) => i.url);
        expect(aliceUrls).toContain(aliceUpload.url);
        expect(aliceUrls).not.toContain(bobUpload.url);

        const bobMediaRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            { headers: { Authorization: "Bearer pk_bob" } },
        );
        const bobMedia = (await bobMediaRes.json()) as MediaPageResponse;
        const bobUrls = bobMedia.items.map((i) => i.url);
        expect(bobUrls).toContain(bobUpload.url);
        expect(bobUrls).not.toContain(aliceUpload.url);
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

    it("rejects more than 8 tags with 400", async () => {
        const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
        const res = await uploadViaForm("pk_alice", {
            fileName: "too-many-tags.png",
            bytes: variant(7),
            tags,
        });
        expect(res.status).toBe(400);
    });

    it("service key without a user is rejected when metadata is supplied, but plain uploads still work", async () => {
        const withTag = await uploadViaForm("pk_nouser", {
            fileName: "nouser-tagged.png",
            bytes: variant(8),
            tags: ["should-fail"],
        });
        expect(withTag.status).toBe(400);
        expect((withTag.body as { error: string }).error).toMatch(
            /cataloging requires a user-owned API key/,
        );

        const plain = await uploadViaForm("pk_nouser", {
            fileName: "nouser-plain.png",
            bytes: variant(9),
        });
        expect(plain.status).toBe(200);
        const upload = plain.body as UploadResponse;
        expect(upload.tags).toBeUndefined();
    });

    it("re-uploading the same file with an additional tag merges tags into one item", async () => {
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
        expect(secondUpload.id).toBe(firstUpload.id);
        expect(secondUpload.duplicate).toBe(true);

        const meRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            {
                headers: { Authorization: "Bearer pk_alice" },
            },
        );
        const me = (await meRes.json()) as MediaPageResponse;
        const matches = me.items.filter((i) => i.url === firstUpload.url);
        expect(matches).toHaveLength(1);
        expect(matches[0].tags.sort()).toEqual(["first-tag", "second-tag"]);
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
        // the ordering assertions below are deterministic.
        const db = drizzle(env.DB);
        for (let i = 0; i < uploads.length; i++) {
            await db
                .update(mediaItem)
                .set({ createdAt: new Date((1000 + i) * 1000) })
                .where(eq(mediaItem.locator, uploads[i].id));
        }

        const page1Res = await SELF.fetch(
            `https://media.pollinations.ai/tags/${tag}?limit=2`,
        );
        expect(page1Res.status).toBe(200);
        const page1 = (await page1Res.json()) as MediaPageResponse;
        expect(page1.items).toHaveLength(2);
        expect(page1.nextCursor).not.toBeNull();
        // Newest first: the most recently uploaded item leads the page.
        expect(page1.items[0].url).toBe(uploads[2].url);
        expect(page1.items[1].url).toBe(uploads[1].url);

        const page2Res = await SELF.fetch(
            `https://media.pollinations.ai/tags/${tag}?limit=2&cursor=${encodeURIComponent(
                page1.nextCursor as string,
            )}`,
        );
        expect(page2Res.status).toBe(200);
        const page2 = (await page2Res.json()) as MediaPageResponse;
        expect(page2.items).toHaveLength(1);
        expect(page2.items[0].url).toBe(uploads[0].url);
        expect(page2.nextCursor).toBeNull();
    });

    describe("reactions", () => {
        // Upload response `id` is the content hash, not the catalog item id.
        // Look the item up via /me/media (as the owner) to get its catalog id.
        async function catalogIdFor(
            ownerKey: string,
            uploadUrl: string,
        ): Promise<string> {
            const res = await SELF.fetch(
                "https://media.pollinations.ai/me/media",
                { headers: { Authorization: `Bearer ${ownerKey}` } },
            );
            const page = (await res.json()) as MediaPageResponse;
            const item = page.items.find((i) => i.url === uploadUrl);
            if (!item) throw new Error(`item not found for ${uploadUrl}`);
            return item.id;
        }

        function reactionUrl(itemId: string, reaction: string): string {
            return `https://media.pollinations.ai/media/${itemId}/reactions/${reaction}`;
        }

        it("like, repeat like, and visibility via /tags/:tag (anonymous vs authenticated)", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "like-flow.png",
                bytes: variant(30),
                tags: ["like-flow-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            const likeRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(likeRes.status).toBe(200);
            expect((await likeRes.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: true,
                count: 1,
            });

            // Repeat like is idempotent.
            const likeAgainRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(likeAgainRes.status).toBe(200);
            expect((await likeAgainRes.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: true,
                count: 1,
            });

            // Anonymous tag browsing: reaction counts present, no myReactions.
            const anonRes = await SELF.fetch(
                "https://media.pollinations.ai/tags/like-flow-tag",
            );
            expect(anonRes.status).toBe(200);
            const anon = (await anonRes.json()) as MediaPageResponse;
            const anonItem = anon.items.find((i) => i.id === itemId);
            expect(anonItem?.reactions).toEqual({ like: 1 });
            expect(anonItem).not.toHaveProperty("myReactions");

            // Bob (the reactor) sees "like" in myReactions.
            const bobRes = await SELF.fetch(
                "https://media.pollinations.ai/tags/like-flow-tag",
                { headers: { Authorization: "Bearer pk_bob" } },
            );
            const bobPage = (await bobRes.json()) as MediaPageResponse;
            expect(
                bobPage.items.find((i) => i.id === itemId)?.myReactions,
            ).toEqual(["like"]);

            // Alice (no reactions) gets an empty myReactions.
            const aliceRes = await SELF.fetch(
                "https://media.pollinations.ai/tags/like-flow-tag",
                { headers: { Authorization: "Bearer pk_alice" } },
            );
            const alicePage = (await aliceRes.json()) as MediaPageResponse;
            expect(
                alicePage.items.find((i) => i.id === itemId)?.myReactions,
            ).toEqual([]);
        });

        it("unlike and repeat unlike are idempotent", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "unlike-flow.png",
                bytes: variant(31),
                tags: ["unlike-flow-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });

            const unlikeRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "DELETE",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(unlikeRes.status).toBe(200);
            expect((await unlikeRes.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: false,
                count: 0,
            });

            // Repeat unlike is idempotent.
            const unlikeAgainRes = await SELF.fetch(
                reactionUrl(itemId, "like"),
                {
                    method: "DELETE",
                    headers: { Authorization: "Bearer pk_bob" },
                },
            );
            expect(unlikeAgainRes.status).toBe(200);
            expect((await unlikeAgainRes.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: false,
                count: 0,
            });
        });

        it("two different likers accumulate to 2, reflected in owner's /me/media", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "two-likers.png",
                bytes: variant(32),
                tags: ["two-likers-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            const aliceLike = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_alice" },
            });
            expect((await aliceLike.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: true,
                count: 1,
            });

            const bobLike = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect((await bobLike.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: true,
                count: 2,
            });

            const meRes = await SELF.fetch(
                "https://media.pollinations.ai/me/media",
                { headers: { Authorization: "Bearer pk_alice" } },
            );
            const me = (await meRes.json()) as MediaPageResponse;
            const meItem = me.items.find((i) => i.id === itemId);
            expect(meItem?.reactions).toEqual({ like: 2 });
            expect(meItem?.myReactions).toEqual(["like"]);
        });

        it("multiple reaction kinds from one user coexist on an item", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "multi-kind.png",
                bytes: variant(34),
                tags: ["multi-kind-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            for (const kind of ["like", "bookmark"]) {
                const res = await SELF.fetch(reactionUrl(itemId, kind), {
                    method: "PUT",
                    headers: { Authorization: "Bearer pk_bob" },
                });
                expect((await res.json()) as ReactionResponse).toEqual({
                    reaction: kind,
                    reacted: true,
                    count: 1,
                });
            }
            await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_alice" },
            });

            const bobRes = await SELF.fetch(
                "https://media.pollinations.ai/tags/multi-kind-tag",
                { headers: { Authorization: "Bearer pk_bob" } },
            );
            const bobPage = (await bobRes.json()) as MediaPageResponse;
            const bobItem = bobPage.items.find((i) => i.id === itemId);
            expect(bobItem?.reactions).toEqual({ like: 2, bookmark: 1 });
            expect(bobItem?.myReactions?.sort()).toEqual(["bookmark", "like"]);
        });

        it("PUT /media/:id/reactions/like with a nonexistent item id returns 404", async () => {
            const randomId = crypto.randomUUID();
            const res = await SELF.fetch(reactionUrl(randomId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_alice" },
            });
            expect(res.status).toBe(404);
            expect((await res.json()) as { error: string }).toEqual({
                error: "Media item not found",
            });
        });

        it("rejects an invalid reaction kind with 400, naming it", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "bad-kind.png",
                bytes: variant(35),
                tags: ["bad-kind-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            const res = await SELF.fetch(
                reactionUrl(itemId, encodeURIComponent("UPPER!")),
                {
                    method: "PUT",
                    headers: { Authorization: "Bearer pk_alice" },
                },
            );
            expect(res.status).toBe(400);
            expect(((await res.json()) as { error: string }).error).toMatch(
                /UPPER!/,
            );
        });

        it("cannot react to another user's untagged (private) item, but the owner can", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "private-react.png",
                bytes: variant(36),
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            // 404 (not 403) so the leaked id isn't confirmed to exist.
            const bobRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(bobRes.status).toBe(404);

            const aliceRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_alice" },
            });
            expect(aliceRes.status).toBe(200);
            expect((await aliceRes.json()) as ReactionResponse).toEqual({
                reaction: "like",
                reacted: true,
                count: 1,
            });
        });

        it("caps distinct reaction kinds per user per item at 8", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "cap-kinds.png",
                bytes: variant(37),
                tags: ["cap-kinds-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            for (let i = 0; i < 8; i++) {
                const res = await SELF.fetch(reactionUrl(itemId, `kind-${i}`), {
                    method: "PUT",
                    headers: { Authorization: "Bearer pk_bob" },
                });
                expect(res.status).toBe(200);
            }

            const overCap = await SELF.fetch(reactionUrl(itemId, "kind-8"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(overCap.status).toBe(400);

            // Repeating an existing kind is not a new kind — still idempotent.
            const repeat = await SELF.fetch(reactionUrl(itemId, "kind-0"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_bob" },
            });
            expect(repeat.status).toBe(200);
        });

        it("auth failures: missing/unknown/no-user keys on react, and unknown key on /tags/:tag", async () => {
            const { status, body } = await uploadViaForm("pk_alice", {
                fileName: "auth-fail.png",
                bytes: variant(33),
                tags: ["auth-fail-tag"],
            });
            expect(status).toBe(200);
            const upload = body as UploadResponse;
            const itemId = await catalogIdFor("pk_alice", upload.url);

            const noKeyRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
            });
            expect(noKeyRes.status).toBe(401);

            const unknownKeyRes = await SELF.fetch(
                reactionUrl(itemId, "like"),
                {
                    method: "PUT",
                    headers: { Authorization: "Bearer pk_unknown" },
                },
            );
            expect(unknownKeyRes.status).toBe(401);

            const noUserRes = await SELF.fetch(reactionUrl(itemId, "like"), {
                method: "PUT",
                headers: { Authorization: "Bearer pk_nouser" },
            });
            expect(noUserRes.status).toBe(403);

            const tagUnknownKeyRes = await SELF.fetch(
                "https://media.pollinations.ai/tags/auth-fail-tag",
                { headers: { Authorization: "Bearer pk_unknown" } },
            );
            expect(tagUnknownKeyRes.status).toBe(401);
        });
    });
});
