import { fetchMock, SELF } from "cloudflare:test";
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
    visibility: string;
    source: string;
    parents: string[];
    tags: string[];
}

interface CatalogItem {
    entryId: string;
    hash: string;
    url: string;
    visibility: string;
    tags: string[];
    parents: string[];
    ownerId?: string;
    apiKeyId?: string;
    verifiedApp: { keyId: string; name: string | null } | null;
}

interface CatalogList {
    items: CatalogItem[];
    nextCursor: string | null;
}

const VALID_KEY = "pk_test_key_123";

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
                keyId: "key_user_123",
                apiKeyId: "key_user_123",
                type: "publishable",
                name: "test-user",
                userId: "user_123",
                byopClientKeyId: "app_catgpt",
                byopClientName: "CatGPT",
                byopClientUserId: "app_owner_123",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();
}

describe("media.pollinations.ai", () => {
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
        expect(upload.cataloged).toBe(true);

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

    it("catalogs owner media, verified app media, tags, and lineage", async () => {
        const parentForm = new FormData();
        parentForm.append(
            "file",
            new File([TINY_PNG], "parent.png", { type: "image/png" }),
        );
        parentForm.append("visibility", "public");
        parentForm.append("source", "generation");
        parentForm.append("tags", "catgpt,meme");
        parentForm.append("prompt", "parent prompt");

        const parentRes = await SELF.fetch(
            "https://media.pollinations.ai/upload?app=spoofed_app",
            {
                method: "POST",
                body: parentForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(parentRes.status).toBe(200);
        const parent = (await parentRes.json()) as UploadResponse;
        expect(parent.cataloged).toBe(true);
        expect(parent.tags).toEqual(["catgpt", "meme"]);

        const childForm = new FormData();
        childForm.append(
            "file",
            new File([TINY_PNG], "child.png", { type: "image/png" }),
        );
        childForm.append("visibility", "public");
        childForm.append("kind", "edit");
        childForm.append("parents", parent.url);
        childForm.append("relationship", "catgpt_reply");
        childForm.append("tag", "meme");

        const childRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: childForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(childRes.status).toBe(200);
        const child = (await childRes.json()) as UploadResponse;
        expect(child.parents).toEqual([parent.id]);

        const meRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media?tag=meme",
            { headers: { Authorization: `Bearer ${VALID_KEY}` } },
        );
        expect(meRes.status).toBe(200);
        const me = (await meRes.json()) as CatalogList;
        expect(me.items.some((item) => item.hash === parent.id)).toBe(true);
        expect(me.items[0].ownerId).toBe("user_123");
        expect(me.items[0].apiKeyId).toBe("key_user_123");

        const spoofedAppRes = await SELF.fetch(
            "https://media.pollinations.ai/apps/spoofed_app/media",
        );
        const spoofedApp = (await spoofedAppRes.json()) as CatalogList;
        expect(spoofedApp.items).toHaveLength(0);

        const appRes = await SELF.fetch(
            "https://media.pollinations.ai/apps/app_catgpt/media?tag=meme",
        );
        expect(appRes.status).toBe(200);
        const app = (await appRes.json()) as CatalogList;
        expect(app.items.some((item) => item.hash === parent.id)).toBe(true);
        expect(app.items.some((item) => item.hash === child.id)).toBe(true);
        expect(app.items[0].ownerId).toBeUndefined();
        expect(app.items[0].apiKeyId).toBeUndefined();
        expect(app.items[0].verifiedApp?.keyId).toBe("app_catgpt");

        const childrenRes = await SELF.fetch(
            `https://media.pollinations.ai/${parent.id}/children`,
        );
        expect(childrenRes.status).toBe(200);
        const children = (await childrenRes.json()) as CatalogList;
        expect(children.items.map((item) => item.hash)).toContain(child.id);

        const tagRes = await SELF.fetch(
            "https://media.pollinations.ai/tags/meme/media",
        );
        expect(tagRes.status).toBe(200);
        const tagged = (await tagRes.json()) as CatalogList;
        expect(tagged.items.map((item) => item.hash)).toEqual(
            expect.arrayContaining([parent.id, child.id]),
        );
        expect(tagged.items[0].ownerId).toBeUndefined();
    });

    it("keeps private media out of public app, tag, and children indexes", async () => {
        const parentForm = new FormData();
        parentForm.append(
            "file",
            new File([TINY_PNG], "private-parent.png", { type: "image/png" }),
        );
        parentForm.append("visibility", "public");
        const parentRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: parentForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const parent = (await parentRes.json()) as UploadResponse;

        const privateForm = new FormData();
        privateForm.append(
            "file",
            new File([TINY_PNG], "private-child.png", { type: "image/png" }),
        );
        privateForm.append("visibility", "private");
        privateForm.append("parents", parent.id);
        privateForm.append("tag", "secret");

        const privateRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: privateForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const privateUpload = (await privateRes.json()) as UploadResponse;

        const [appRes, tagRes, childrenRes] = await Promise.all([
            SELF.fetch("https://media.pollinations.ai/apps/app_catgpt/media"),
            SELF.fetch("https://media.pollinations.ai/tags/secret/media"),
            SELF.fetch(`https://media.pollinations.ai/${parent.id}/children`),
        ]);
        const app = (await appRes.json()) as CatalogList;
        const tag = (await tagRes.json()) as CatalogList;
        const children = (await childrenRes.json()) as CatalogList;

        expect(app.items.map((item) => item.hash)).not.toContain(
            privateUpload.id,
        );
        expect(tag.items).toHaveLength(0);
        expect(children.items.map((item) => item.hash)).not.toContain(
            privateUpload.id,
        );
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
