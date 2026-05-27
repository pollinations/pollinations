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
    owner: string | null;
    app: string | null;
    parent: string | null;
    userTags: string[];
}

interface CatalogItem {
    hash: string;
    url: string;
    contentType: string;
    size: number;
    createdAt: string;
    owner: string | null;
    app: string | null;
    appName: string | null;
    parent: string | null;
    userTags: string[];
}

interface ListResponse {
    items: CatalogItem[];
    nextCursor: string | null;
}

const VALID_KEY = "pk_test_key_123";
const OTHER_KEY = "pk_other_key_456";
const NO_USER_KEY = "pk_anon_key_789";

function mockAuth() {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    const pool = fetchMock.get("https://gen.pollinations.ai");

    pool.intercept({
        path: "/account/key",
        headers: { authorization: `Bearer ${VALID_KEY}` },
    })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                type: "publishable",
                name: "test-user",
                userId: "user_alice",
                appId: "catgpt",
                appName: "CatGPT",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();

    pool.intercept({
        path: "/account/key",
        headers: { authorization: `Bearer ${OTHER_KEY}` },
    })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                type: "publishable",
                name: "other-user",
                userId: "user_bob",
                appId: "voice-edit",
                appName: "voice.edit",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();

    pool.intercept({
        path: "/account/key",
        headers: { authorization: `Bearer ${NO_USER_KEY}` },
    })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                type: "publishable",
                name: "legacy-user",
                // no userId / appId — legacy/anonymous key shape
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

    it("upload stamps server-attested owner and app from /account/key", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "stamped.png", { type: "image/png" }),
        );
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;
        expect(upload.owner).toBe("user_alice");
        expect(upload.app).toBe("catgpt");
        expect(upload.parent).toBeNull();
        expect(upload.userTags).toEqual([]);
    });

    it("request-supplied owner/app params do NOT override verified identity", async () => {
        // Adversarial: client tries to claim a different app/owner via the
        // request. These keys are reserved for the server. The upload
        // succeeds but stamps the verified values from /account/key.
        const form = new FormData();
        form.append(
            "file",
            new File([new Uint8Array([1, 2, 3, 4])], "adv.bin", {
                type: "application/octet-stream",
            }),
        );
        form.append("app", "voice-edit");
        form.append("owner", "user_bob");

        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?app=voice-edit&owner=user_bob",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;
        expect(upload.owner).toBe("user_alice");
        expect(upload.app).toBe("catgpt");
    });

    it("lineage: child appears under parent's /children listing", async () => {
        // Upload parent
        const parentForm = new FormData();
        parentForm.append(
            "file",
            new File([new Uint8Array([10, 20, 30])], "parent.bin", {
                type: "application/octet-stream",
            }),
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

        // Upload child claiming parent
        const childForm = new FormData();
        childForm.append(
            "file",
            new File([new Uint8Array([40, 50, 60])], "child.bin", {
                type: "application/octet-stream",
            }),
        );
        childForm.append("parent", parent.id);
        const childRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: childForm,
                headers: { Authorization: `Bearer ${OTHER_KEY}` },
            },
        );
        const child = (await childRes.json()) as UploadResponse;
        expect(child.parent).toBe(parent.id);

        const listRes = await SELF.fetch(
            `https://media.pollinations.ai/${parent.id}/children`,
        );
        expect(listRes.status).toBe(200);
        const list = (await listRes.json()) as ListResponse;
        expect(list.items.length).toBe(1);
        expect(list.items[0]!.hash).toBe(child.id);
        expect(list.items[0]!.app).toBe("voice-edit");
    });

    it("invalid parent hash is ignored (not stored as lineage)", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([new Uint8Array([99, 99, 99])], "noparent.bin", {
                type: "application/octet-stream",
            }),
        );
        form.append("parent", "not-a-hash");
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await res.json()) as UploadResponse;
        expect(upload.parent).toBeNull();
    });

    it("GET /me/media lists only the caller's uploads", async () => {
        // Two uploads as alice, one as bob.
        for (const name of ["alice-a.bin", "alice-b.bin"]) {
            const form = new FormData();
            form.append(
                "file",
                new File(
                    [new Uint8Array([...name].map((c) => c.charCodeAt(0)))],
                    name,
                    {
                        type: "application/octet-stream",
                    },
                ),
            );
            await SELF.fetch("https://media.pollinations.ai/upload", {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            });
        }
        const bobForm = new FormData();
        bobForm.append(
            "file",
            new File([new Uint8Array([66, 79, 66])], "bob.bin", {
                type: "application/octet-stream",
            }),
        );
        await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: bobForm,
            headers: { Authorization: `Bearer ${OTHER_KEY}` },
        });

        const res = await SELF.fetch("https://media.pollinations.ai/me/media", {
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(200);
        const list = (await res.json()) as ListResponse;
        expect(list.items.length).toBeGreaterThanOrEqual(2);
        for (const item of list.items) {
            expect(item.owner).toBe("user_alice");
        }
    });

    it("GET /me/media without auth returns 401", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/me/media");
        expect(res.status).toBe(401);
    });

    it("GET /me/media with key lacking userId returns empty list", async () => {
        const res = await SELF.fetch("https://media.pollinations.ai/me/media", {
            headers: { Authorization: `Bearer ${NO_USER_KEY}` },
        });
        expect(res.status).toBe(200);
        const list = (await res.json()) as ListResponse;
        expect(list.items).toEqual([]);
    });

    it("GET /apps/:app/media lists only that app's uploads", async () => {
        // Alice uploads under catgpt, bob under voice-edit.
        const aForm = new FormData();
        aForm.append(
            "file",
            new File([new Uint8Array([1, 1, 1])], "a.bin", {
                type: "application/octet-stream",
            }),
        );
        await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: aForm,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const bForm = new FormData();
        bForm.append(
            "file",
            new File([new Uint8Array([2, 2, 2])], "b.bin", {
                type: "application/octet-stream",
            }),
        );
        await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: bForm,
            headers: { Authorization: `Bearer ${OTHER_KEY}` },
        });

        const res = await SELF.fetch(
            "https://media.pollinations.ai/apps/catgpt/media",
        );
        expect(res.status).toBe(200);
        const list = (await res.json()) as ListResponse;
        for (const item of list.items) {
            expect(item.app).toBe("catgpt");
        }
        expect(list.items.length).toBeGreaterThan(0);
    });

    it("user tags are lowercased, validated, and capped", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([new Uint8Array([7, 7, 7])], "tagged.bin", {
                type: "application/octet-stream",
            }),
        );
        form.append("tag", "Funny");
        form.append("tag", "cats");
        form.append("tag", "bad tag with spaces");
        form.append("tag", "ok-2");
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await res.json()) as UploadResponse;
        expect(upload.userTags).toContain("funny");
        expect(upload.userTags).toContain("cats");
        expect(upload.userTags).toContain("ok-2");
        expect(upload.userTags).not.toContain("bad tag with spaces");
    });

    it("apps endpoint rejects invalid app id format", async () => {
        const res = await SELF.fetch(
            "https://media.pollinations.ai/apps/bad%20id/media",
        );
        expect(res.status).toBe(400);
    });

    it("children endpoint rejects invalid hash", async () => {
        const res = await SELF.fetch(
            "https://media.pollinations.ai/not-a-hash/children",
        );
        expect(res.status).toBe(400);
    });
});
