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

const VALID_KEY = "pk_test_key_123";

const OTHER_KEY = "pk_test_key_other";

interface CatalogItem {
    hash: string;
    url: string;
    owner: string | null;
    app: string | null;
    tags: string[];
    prompt: string | null;
}

interface CatalogList {
    items: CatalogItem[];
    cursor: string | null;
}

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
                type: "publishable",
                name: "test-user",
                userId: "user_alice",
                keyId: "key_alice_1",
                byopClientKeyId: "app_catgpt",
                byopClientName: "CatGPT",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({
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
                keyId: "key_bob_1",
                byopClientKeyId: "app_voiceedit",
                byopClientName: "Voice Edit",
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

    // ── Catalog tests ──────────────────────────────────────────────────────

    it("untagged upload appears in /me/media but not in any /tags listing", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "untagged.png", { type: "image/png" }),
        );
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;

        const mine = (await (
            await SELF.fetch("https://media.pollinations.ai/me/media", {
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            })
        ).json()) as CatalogList;
        expect(mine.items.some((it) => it.hash === upload.id)).toBe(true);

        // No tag was set, so no tag listing should contain it.
        const tagged = (await (
            await SELF.fetch("https://media.pollinations.ai/tags/anything")
        ).json()) as CatalogList;
        expect(tagged.items.some((it) => it.hash === upload.id)).toBe(false);
    });

    it("tagged upload appears in /tags/<tag> for anyone (opt-in)", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "meme.png", { type: "image/png" }),
        );
        form.append("tag", "catgpt");
        form.append("tag", "meme");
        form.append("prompt", "why is the box mine?");

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await res.json()) as UploadResponse & {
            tags?: string[];
        };
        expect(upload.tags).toEqual(["catgpt", "meme"]);

        // Anyone (no auth) can list by tag.
        const memes = (await (
            await SELF.fetch("https://media.pollinations.ai/tags/meme")
        ).json()) as CatalogList;
        const found = memes.items.find((it) => it.hash === upload.id);
        expect(found).toBeTruthy();
        expect(found?.prompt).toBe("why is the box mine?");
        expect(found?.app).toBe("app_catgpt"); // server-attested
        expect(found?.owner).toBe("user_alice");
    });

    it("server attribution cannot be spoofed via request fields", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "spoof.png", { type: "image/png" }),
        );
        form.append("tag", "spoofcheck");
        // Attacker tries to claim a different owner/app/keyId.
        form.append("owner", "user_attacker");
        form.append("app", "app_victim");
        form.append("byopClientKeyId", "app_victim");

        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await res.json()) as UploadResponse;

        const tagged = (await (
            await SELF.fetch("https://media.pollinations.ai/tags/spoofcheck")
        ).json()) as CatalogList;
        const entry = tagged.items.find((it) => it.hash === upload.id);
        // Server stamped the verified identity, not the spoofed one.
        expect(entry?.owner).toBe("user_alice");
        expect(entry?.app).toBe("app_catgpt");
    });

    it("per-app tag namespace isolates apps using the same tag", async () => {
        // CatGPT uploads with tag=recipe:water+fire (server stamps app_catgpt).
        const a = new FormData();
        a.append("file", new File([TINY_PNG], "a.png", { type: "image/png" }));
        a.append("tag", "recipe:water+fire");
        await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: a,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });

        // Voice Edit uploads with the same tag but lands in its own namespace.
        const b = new FormData();
        b.append(
            "file",
            new File([TINY_PNG, new Uint8Array([1])], "b.png", {
                type: "image/png",
            }),
        );
        b.append("tag", "recipe:water+fire");
        await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: b,
            headers: { Authorization: `Bearer ${OTHER_KEY}` },
        });

        // Global namespace has both.
        const all = (await (
            await SELF.fetch(
                "https://media.pollinations.ai/tags/recipe:water%2Bfire",
            )
        ).json()) as CatalogList;
        expect(all.items.length).toBeGreaterThanOrEqual(2);

        // Per-app namespace returns only CatGPT's entry.
        const onlyCatgpt = (await (
            await SELF.fetch(
                "https://media.pollinations.ai/tags/recipe:water%2Bfire?app=app_catgpt",
            )
        ).json()) as CatalogList;
        expect(onlyCatgpt.items.length).toBeGreaterThan(0);
        for (const it of onlyCatgpt.items) expect(it.app).toBe("app_catgpt");
    });

    it("/me/media is scoped to the calling user only", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG, new Uint8Array([2])], "bob.png", {
                type: "image/png",
            }),
        );
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${OTHER_KEY}` },
        });
        const bobUpload = (await res.json()) as UploadResponse;

        // Alice's /me/media must NOT contain Bob's upload.
        const alice = (await (
            await SELF.fetch("https://media.pollinations.ai/me/media", {
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            })
        ).json()) as CatalogList;
        expect(alice.items.some((it) => it.hash === bobUpload.id)).toBe(false);

        const bob = (await (
            await SELF.fetch("https://media.pollinations.ai/me/media", {
                headers: { Authorization: `Bearer ${OTHER_KEY}` },
            })
        ).json()) as CatalogList;
        expect(bob.items.some((it) => it.hash === bobUpload.id)).toBe(true);
        for (const it of bob.items) expect(it.owner).toBe("user_bob");
    });

    it("invalid tag is rejected by /tags/:tag", async () => {
        const res = await SELF.fetch(
            "https://media.pollinations.ai/tags/spaces%20not%20allowed",
        );
        expect(res.status).toBe(400);
    });

    it("malformed tags are silently dropped during upload", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "mixed.png", { type: "image/png" }),
        );
        form.append("tag", "ok-tag");
        form.append("tag", "bad tag with spaces");
        form.append("tag", "");
        const res = await SELF.fetch("https://media.pollinations.ai/upload", {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${VALID_KEY}` },
        });
        const upload = (await res.json()) as UploadResponse & {
            tags?: string[];
        };
        // Good tag kept, bad ones silently dropped.
        expect(upload.tags).toEqual(["ok-tag"]);
    });

    // The "lineage as a tag" convention this PR documents — apps that want a
    // parent/child link just emit `tag=parent:<hash>`. The catalog has no
    // first-class lineage concept; this test demonstrates that the convention
    // works through the existing tag primitive.
    it("lineage via tag=parent:<hash> convention", async () => {
        // Upload the parent.
        const parentForm = new FormData();
        parentForm.append(
            "file",
            new File([TINY_PNG, new Uint8Array([3])], "parent.png", {
                type: "image/png",
            }),
        );
        const parent = (await (
            await SELF.fetch("https://media.pollinations.ai/upload", {
                method: "POST",
                body: parentForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            })
        ).json()) as UploadResponse;

        // Upload a child that tags the parent.
        const childForm = new FormData();
        childForm.append(
            "file",
            new File([TINY_PNG, new Uint8Array([4])], "child.png", {
                type: "image/png",
            }),
        );
        childForm.append("tag", `parent:${parent.id}`);
        const child = (await (
            await SELF.fetch("https://media.pollinations.ai/upload", {
                method: "POST",
                body: childForm,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            })
        ).json()) as UploadResponse;

        // Query the parent's "children" via the generic tag endpoint.
        const remixes = (await (
            await SELF.fetch(
                `https://media.pollinations.ai/tags/parent:${parent.id}`,
            )
        ).json()) as CatalogList;
        expect(remixes.items.some((it) => it.hash === child.id)).toBe(true);
    });
});
