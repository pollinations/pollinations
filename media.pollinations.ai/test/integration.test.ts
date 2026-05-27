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
}

interface CatalogItem {
    hash: string;
    url: string;
    prompt?: string;
    appId?: string;
    ownerId?: string;
    tags?: string[];
    userTags?: string[];
}

const VALID_KEY = "pk_test_key_123";
const APP_KEY = "pk_app_test";

function mockAuth() {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({
            path: "/account/key",
            headers: { authorization: `Bearer ${VALID_KEY}` },
        })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                keyId: "user-key-test",
                type: "publishable",
                name: "test-user",
                userId: "user-test",
                byopClientKeyId: "app-test",
                byopClientName: "CatGPT Test",
                appId: "app-test",
                appName: "CatGPT Test",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({
            path: "/account/key",
            headers: { authorization: `Bearer ${APP_KEY}` },
        })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                keyId: "app-test",
                type: "publishable",
                name: "CatGPT Test",
                userId: "app-owner-test",
                byopClientKeyId: null,
                byopClientName: null,
                appId: null,
                appName: null,
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

    it("indexes uploaded media for owner and public app gallery", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "catgpt-public.png", { type: "image/png" }),
        );
        form.append("visibility", "public");
        form.append("source", "generation");
        form.append("prompt", "Why is the box mine?");
        form.append("model", "nanobanana");
        form.append("tag", "catgpt");
        form.append("tags", "meme,invalid tag");

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

        const mineRes = await SELF.fetch(
            "https://media.pollinations.ai/me/media?app=app-test",
            { headers: { Authorization: `Bearer ${VALID_KEY}` } },
        );
        expect(mineRes.status).toBe(200);
        const mine = (await mineRes.json()) as { items: CatalogItem[] };
        expect(mine.items.some((item) => item.hash === upload.id)).toBe(true);

        const galleryRes = await SELF.fetch(
            `https://media.pollinations.ai/gallery?app_key=${APP_KEY}`,
        );
        expect(galleryRes.status).toBe(200);
        const gallery = (await galleryRes.json()) as { items: CatalogItem[] };
        const item = gallery.items.find((entry) => entry.hash === upload.id);
        expect(item?.prompt).toBe("Why is the box mine?");
        expect(item?.appId).toBe("app-test");
        expect(item?.tags).toEqual(["catgpt", "meme"]);

        const appRes = await SELF.fetch(
            "https://media.pollinations.ai/apps/app-test/media",
        );
        expect(appRes.status).toBe(200);
        const appGallery = (await appRes.json()) as { items: CatalogItem[] };
        expect(appGallery.items.some((entry) => entry.hash === upload.id)).toBe(
            true,
        );

        const tagRes = await SELF.fetch(
            `https://media.pollinations.ai/tags/catgpt?app_key=${APP_KEY}`,
        );
        expect(tagRes.status).toBe(200);
        const tagged = (await tagRes.json()) as { items: CatalogItem[] };
        expect(tagged.items.some((entry) => entry.hash === upload.id)).toBe(
            true,
        );
    });

    it("indexes remix children by parent hash", async () => {
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
        childForm.append("visibility", "public");
        childForm.append("source", "remix");
        childForm.append("remixOf", parent.id);
        childForm.append("prompt", "make it glow");
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

        const privateChildForm = new FormData();
        privateChildForm.append(
            "file",
            new File([TINY_PNG], "private-child.png", { type: "image/png" }),
        );
        privateChildForm.append("source", "remix");
        privateChildForm.append("remixOf", parent.id);
        const privateChildRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: privateChildForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(privateChildRes.status).toBe(200);
        const privateChild = (await privateChildRes.json()) as UploadResponse;

        const childrenRes = await SELF.fetch(
            `https://media.pollinations.ai/${parent.id}/children`,
        );
        expect(childrenRes.status).toBe(200);
        const children = (await childrenRes.json()) as { items: CatalogItem[] };
        const item = children.items.find((entry) => entry.hash === child.id);
        expect(item?.prompt).toBe("make it glow");
        expect(
            children.items.some((entry) => entry.hash === privateChild.id),
        ).toBe(false);
    });

    it("rejects invalid remix parents", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "bad-remix.png", { type: "image/png" }),
        );
        form.append("remixOf", "not-a-hash");

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(400);
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

    // Adversarial: request body declares a fake owner/app, server must ignore
    // them. The catalog must be stamped only with values from the verified key.
    it("request-supplied owner/app fields cannot override verified identity", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "spoofed.png", { type: "image/png" }),
        );
        form.append("visibility", "public");
        // These should be ignored by the server.
        form.append("ownerId", "attacker-user");
        form.append("appId", "victim-app");
        form.append("appName", "Stolen App");

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;

        const gallery = (await (
            await SELF.fetch(
                "https://media.pollinations.ai/apps/victim-app/media",
            )
        ).json()) as { items: CatalogItem[] };
        expect(gallery.items.some((it) => it.hash === upload.id)).toBe(false);

        const realApp = (await (
            await SELF.fetch(
                "https://media.pollinations.ai/apps/app-test/media",
            )
        ).json()) as { items: CatalogItem[] };
        const found = realApp.items.find((it) => it.hash === upload.id);
        expect(found?.ownerId).toBe("user-test");
        expect(found?.appId).toBe("app-test");
    });

    // Multi-parent: recipe and mash-up apps combine multiple inputs.
    it("indexes a child under each declared parent", async () => {
        const parents: string[] = [];
        for (const name of ["ingredient-a.png", "ingredient-b.png"]) {
            const form = new FormData();
            form.append(
                "file",
                new File([TINY_PNG], name, { type: "image/png" }),
            );
            form.append("visibility", "public");
            const r = await SELF.fetch("https://media.pollinations.ai/upload", {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            });
            parents.push(((await r.json()) as UploadResponse).id);
        }

        const childForm = new FormData();
        childForm.append(
            "file",
            new File([TINY_PNG], "combo.png", { type: "image/png" }),
        );
        childForm.append("visibility", "public");
        childForm.append("relationship", "combine");
        // Multiple `parent` entries — order shouldn't matter for indexing.
        for (const p of parents) childForm.append("parent", p);
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

        for (const parent of parents) {
            const listRes = await SELF.fetch(
                `https://media.pollinations.ai/${parent}/children`,
            );
            const list = (await listRes.json()) as { items: CatalogItem[] };
            const entry = list.items.find((it) => it.hash === child.id) as
                | (CatalogItem & {
                      parents?: string[];
                      relationship?: string;
                  })
                | undefined;
            expect(entry).toBeTruthy();
            expect(entry?.parents).toEqual(parents);
            expect(entry?.relationship).toBe("combine");
        }
    });

    // Recipe-style apps can use tag=recipe:water+fire to dedupe combinations
    // across users without scanning the global tag namespace.
    it("indexes per-app tags for recipe-style lookups", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "steam.png", { type: "image/png" }),
        );
        form.append("visibility", "public");
        form.append("tag", "recipe:water+fire");
        form.append("tag", "element:steam");
        const r = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await r.json()) as UploadResponse;

        const tagRes = await SELF.fetch(
            "https://media.pollinations.ai/tags/recipe:water%2Bfire?app=app-test",
        );
        expect(tagRes.status).toBe(200);
        const tagged = (await tagRes.json()) as { items: CatalogItem[] };
        expect(tagged.items.some((it) => it.hash === upload.id)).toBe(true);
    });

    // Multi-value invalid parent must reject the whole upload.
    it("rejects upload if any parent is malformed", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "bad.png", { type: "image/png" }),
        );
        form.append("parent", "0000000000000000");
        form.append("parent", "not-a-hash");
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(400);
    });
});
