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
    visibility: "private" | "unlisted" | "public";
    source: "upload" | "generation" | "saved_generation" | "edit" | "remix";
    parents: string[];
    tags: string[];
    appId?: string;
    appName?: string;
}

interface CatalogListResponse {
    items: Array<{
        hash: string;
        url: string;
        visibility: "private" | "unlisted" | "public";
        source: string;
        appId?: string;
        appName?: string;
        parents: string[];
        tags: string[];
        prompt?: string;
        model?: string;
    }>;
    nextCursor?: string;
}

const VALID_KEY = "pk_test_key_123";
const AUTH_USER_ID = "user_test_1";
const AUTH_API_KEY_ID = "api_key_test_1";
const AUTH_APP_ID = "app_key_test_1";
const AUTH_APP_NAME = "CatGPT Test";

async function uploadPng(
    name: string,
    fields: Record<string, string> = {},
): Promise<UploadResponse> {
    const form = new FormData();
    form.append("file", new File([TINY_PNG], name, { type: "image/png" }));
    for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
    }

    const response = await SELF.fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${VALID_KEY}` },
    });
    expect(response.status).toBe(200);
    return (await response.json()) as UploadResponse;
}

async function listCatalog(path: string): Promise<CatalogListResponse> {
    const response = await SELF.fetch(`https://media.pollinations.ai${path}`, {
        headers: { Authorization: `Bearer ${VALID_KEY}` },
    });
    expect(response.status).toBe(200);
    return (await response.json()) as CatalogListResponse;
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
                userId: AUTH_USER_ID,
                apiKeyId: AUTH_API_KEY_ID,
                byopClientKeyId: AUTH_APP_ID,
                byopClientName: AUTH_APP_NAME,
                byopClientUserId: "app_owner_test_1",
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
        expect(upload.visibility).toBe("private");

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

    it("catalogs owner media, app galleries, tags, and public lineage", async () => {
        const nonce = crypto.randomUUID();
        const parent = await uploadPng(`catalog-parent-${nonce}.png`, {
            visibility: "public",
            tags: "catgpt",
            source: "generation",
            prompt: "a source cat portrait",
            model: "flux",
        });
        const privateChild = await uploadPng(`catalog-private-${nonce}.png`, {
            parent: parent.url,
            tags: "catgpt",
            source: "edit",
        });
        const child = await uploadPng(`catalog-child-${nonce}.png`, {
            parents: JSON.stringify([parent.url]),
            tags: JSON.stringify(["CatGPT", "Remix!!"]),
            visibility: "public",
            source: "edit",
            prompt: "add a tiny wizard hat",
            model: "flux",
        });

        expect(child.cataloged).toBe(true);
        expect(child.visibility).toBe("public");
        expect(child.source).toBe("edit");
        expect(child.parents).toEqual([parent.id]);
        expect(child.tags).toEqual(["catgpt", "remix"]);
        expect(child.appId).toBe(AUTH_APP_ID);
        expect(child.appName).toBe(AUTH_APP_NAME);

        const mine = await listCatalog("/me/media?limit=50");
        expect(mine.items.some((item) => item.hash === child.id)).toBe(true);
        expect(mine.items.some((item) => item.hash === privateChild.id)).toBe(
            true,
        );

        const mineByApp = await listCatalog(
            `/me/media?app=${AUTH_APP_ID}&tag=catgpt&limit=50`,
        );
        expect(mineByApp.items.some((item) => item.hash === child.id)).toBe(
            true,
        );

        const appGallery = await listCatalog(
            `/gallery?app=${AUTH_APP_ID}&tag=catgpt&limit=50`,
        );
        expect(appGallery.items.some((item) => item.hash === child.id)).toBe(
            true,
        );
        expect(
            appGallery.items.some((item) => item.hash === privateChild.id),
        ).toBe(false);

        const appAlias = await listCatalog(
            `/apps/${AUTH_APP_ID}/media?tag=catgpt&limit=50`,
        );
        expect(appAlias.items.some((item) => item.hash === child.id)).toBe(
            true,
        );

        const tagged = await listCatalog("/tags/remix?limit=50");
        expect(tagged.items.some((item) => item.hash === child.id)).toBe(true);

        const children = await listCatalog(`/${parent.id}/children?limit=50`);
        const listedChild = children.items.find(
            (item) => item.hash === child.id,
        );
        expect(listedChild).toBeTruthy();
        expect(listedChild?.parents).toEqual([parent.id]);
        expect(listedChild?.prompt).toBe("add a tiny wizard hat");
        expect(
            children.items.some((item) => item.hash === privateChild.id),
        ).toBe(false);
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
