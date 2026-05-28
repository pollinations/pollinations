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
    entryId: string;
    visibility: string;
    tags: string[];
}

const VALID_KEY = "pk_test_key_123";
const TEST_USER_ID = "test-user-id";
const TEST_API_KEY_ID = "test-api-key-id";
const TEST_APP_KEY_ID = "test-app-key-id";
const TEST_APP_NAME = "CatGPT";

interface CatalogListResponse {
    media: Array<Record<string, unknown>>;
    count: number;
    limit: number;
}

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
                userId: TEST_USER_ID,
                apiKeyId: TEST_API_KEY_ID,
                keyId: TEST_API_KEY_ID,
                byopClientKeyId: TEST_APP_KEY_ID,
                byopClientName: TEST_APP_NAME,
                byopClientUserId: "test-app-owner-id",
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

    it("public catalog reads require a tag", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/catalog");
        expect(res.status).toBe(400);
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

    it("catalogs uploads with public tags and redacts public lists", async () => {
        const tag = `test:${crypto.randomUUID()}`;
        const parentTag = "parent:abcdef1234567890";
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "catalog.png", { type: "image/png" }),
        );
        form.append("visibility", "public");
        form.append(
            "tags",
            `catgpt,${tag},${parentTag},app:forged,hash:forged`,
        );
        form.append("prompt", "catalog test prompt");
        form.append("model", "flux");

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
        expect(upload.entryId).toBeTruthy();
        expect(upload.visibility).toBe("public");
        expect(upload.tags).toContain(tag);
        expect(upload.tags).toContain(parentTag);
        expect(upload.tags).toContain(`app:${TEST_APP_KEY_ID}`);
        expect(upload.tags).toContain(`hash:${upload.id}`);
        expect(upload.tags).not.toContain("app:forged");
        expect(upload.tags).not.toContain("hash:forged");

        const meRes = await SELF.fetch(
            "https://media.pollinations.ai/catalog?scope=mine",
            { headers: { Authorization: `Bearer ${VALID_KEY}` } },
        );
        expect(meRes.status).toBe(200);
        const me = (await meRes.json()) as CatalogListResponse;
        const privateItem = me.media.find(
            (item) => item.entryId === upload.entryId,
        );
        expect(privateItem).toBeTruthy();
        expect(privateItem?.ownerUserId).toBe(TEST_USER_ID);
        expect(privateItem?.apiKeyId).toBe(TEST_API_KEY_ID);

        const tagRes = await SELF.fetch(
            `https://media.pollinations.ai/catalog?tag=${encodeURIComponent(tag)}`,
        );
        expect(tagRes.status).toBe(200);
        const byTag = (await tagRes.json()) as CatalogListResponse;
        const publicItem = byTag.media.find(
            (item) => item.entryId === upload.entryId,
        );
        expect(publicItem).toBeTruthy();
        expect(publicItem?.appName).toBe(TEST_APP_NAME);
        expect(publicItem?.ownerUserId).toBeUndefined();
        expect(publicItem?.apiKeyId).toBeUndefined();

        const hashRes = await SELF.fetch(
            `https://media.pollinations.ai/catalog?tag=${encodeURIComponent(`hash:${upload.id}`)}`,
        );
        expect(hashRes.status).toBe(200);
        const byHash = (await hashRes.json()) as CatalogListResponse;
        expect(
            byHash.media.some((item) => item.entryId === upload.entryId),
        ).toBe(true);
    });

    it("catalogs existing gen URLs without storing the key in the URL", async () => {
        const tag = `gen:${crypto.randomUUID()}`;
        const res = await SELF.fetch("https://media.pollinations.ai/catalog", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${VALID_KEY}`,
            },
            body: JSON.stringify({
                url: `https://gen.pollinations.ai/image/test?width=512&key=${VALID_KEY}&save=1&tag=ignored`,
                visibility: "public",
                tags: ["catgpt", tag, "parent:abcdef1234567890"],
                prompt: "test",
                model: "flux",
                contentType: "image/png",
                size: 67,
            }),
        });
        expect(res.status).toBe(200);
        const entry = (await res.json()) as Record<string, unknown>;
        expect(entry.cataloged).toBe(true);
        expect(entry.url).toBe(
            "https://gen.pollinations.ai/image/test?width=512",
        );
        expect(entry.appKeyId).toBe(TEST_APP_KEY_ID);

        const catalogRes = await SELF.fetch(
            `https://media.pollinations.ai/catalog?tag=${encodeURIComponent(tag)}`,
        );
        expect(catalogRes.status).toBe(200);
        const catalog = (await catalogRes.json()) as CatalogListResponse;
        const publicItem = catalog.media.find(
            (item) => item.entryId === entry.entryId,
        );
        expect(publicItem).toBeTruthy();
        expect(publicItem?.url).toBe(
            "https://gen.pollinations.ai/image/test?width=512",
        );
        expect(publicItem?.apiKeyId).toBeUndefined();
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
