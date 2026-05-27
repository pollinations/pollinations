import { env, fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    cataloged: boolean;
    entryId: string;
}

const VALID_KEY = "pk_test_key_123";
const USER_ID = "user_test_123";
const API_KEY_ID = "key_test_123";
const APP_KEY_ID = "app_key_test_123";

const CATALOG_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS media_objects (
        hash TEXT PRIMARY KEY,
        full_sha256 TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS media_entries (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL,
        api_key_id TEXT NOT NULL,
        verified_app_key_id TEXT,
        verified_app_name TEXT,
        verified_app_owner_user_id TEXT,
        visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_media_entries_owner_hash
        ON media_entries(owner_user_id, hash)`,
    `CREATE INDEX IF NOT EXISTS idx_media_entries_owner_created
        ON media_entries(owner_user_id, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_media_entries_app_created
        ON media_entries(verified_app_key_id, visibility, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_media_entries_hash_visibility
        ON media_entries(hash, visibility)`,
    `CREATE TABLE IF NOT EXISTS media_edges (
        parent_hash TEXT NOT NULL,
        child_hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
        relationship TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        verified_app_key_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (parent_hash, child_hash, relationship, actor_user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_media_edges_parent_created
        ON media_edges(parent_hash, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS media_tags (
        hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        verified_app_key_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (hash, tag, verified_app_key_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_media_tags_tag
        ON media_tags(tag, created_at DESC)`,
];

function mockAuth() {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({ path: "/account/key" })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                type: "publishable",
                name: "test-user",
                userId: USER_ID,
                apiKeyId: API_KEY_ID,
                byopClientKeyId: APP_KEY_ID,
                byopClientName: "CatGPT",
                byopClientUserId: "app_owner_123",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();
}

async function resetCatalog() {
    const db = (env as { MEDIA_DB: D1Database }).MEDIA_DB;
    for (const statement of CATALOG_STATEMENTS) {
        await db.prepare(statement).run();
    }
    for (const table of [
        "media_tags",
        "media_edges",
        "media_entries",
        "media_objects",
    ]) {
        await db.prepare(`DELETE FROM ${table}`).run();
    }
}

describe("media.pollinations.ai", () => {
    beforeEach(async () => {
        await resetCatalog();
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
        expect(upload.cataloged).toBe(true);
        expect(upload.entryId).toBeTruthy();

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

    it("catalogs uploads for owner, verified app, and children", async () => {
        const parentForm = new FormData();
        parentForm.append(
            "file",
            new File([TINY_PNG], "parent.png", { type: "image/png" }),
        );

        const parentRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: parentForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const parent = (await parentRes.json()) as UploadResponse;

        const childForm = new FormData();
        childForm.append(
            "file",
            new File([TINY_PNG], "child.png", { type: "image/png" }),
        );
        childForm.append("parents", parent.id);
        childForm.append("relationship", "edit");
        childForm.append("visibility", "public");
        childForm.append("tags", "catgpt,remix");

        const childRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: childForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const child = (await childRes.json()) as UploadResponse;

        const mineRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media",
            { headers: { Authorization: `Bearer ${VALID_KEY}` } },
        );
        expect(mineRes.status).toBe(200);
        const mine = (await mineRes.json()) as {
            items: Array<{
                hash: string;
                verifiedApp: { keyId: string } | null;
            }>;
        };
        expect(mine.items.map((item) => item.hash)).toContain(parent.id);
        expect(mine.items.map((item) => item.hash)).toContain(child.id);
        expect(mine.items[0].verifiedApp?.keyId).toBe(APP_KEY_ID);

        const appRes = await SELF.fetch(
            `https://media.pollinations.ai/apps/${APP_KEY_ID}/media`,
        );
        expect(appRes.status).toBe(200);
        const appMedia = (await appRes.json()) as {
            items: Array<{ hash: string; tags: string[] }>;
        };
        expect(appMedia.items).toHaveLength(1);
        expect(appMedia.items[0].hash).toBe(child.id);
        expect(appMedia.items[0].tags).toContain("catgpt");

        const childrenRes = await SELF.fetch(
            `https://media.pollinations.ai/${parent.id}/children`,
        );
        expect(childrenRes.status).toBe(200);
        const children = (await childrenRes.json()) as {
            items: Array<{
                hash: string;
                parentHash: string;
                relationship: string;
            }>;
        };
        expect(children.items).toHaveLength(1);
        expect(children.items[0]).toMatchObject({
            hash: child.id,
            parentHash: parent.id,
            relationship: "edit",
        });
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
});
