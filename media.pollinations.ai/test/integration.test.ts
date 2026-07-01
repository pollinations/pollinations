import { createExecutionContext, fetchMock, SELF } from "cloudflare:test";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expiresAt: string;
    retentionDays: number;
}

const VALID_KEY = "pk_test_key_123";

function createMediaEnv(bucket = createTestR2Bucket()) {
    return {
        MEDIA_BUCKET: bucket,
        MAX_FILE_SIZE: "52428800",
    };
}

function mockAuth() {
    fetchMock
        .get("https://gen.pollinations.ai")
        .intercept({ path: "/account/key" })
        .reply(
            200,
            JSON.stringify({
                valid: true,
                type: "publishable",
                name: "test-user",
            }),
            { headers: { "content-type": "application/json" } },
        )
        .persist();
}

describe("media.pollinations.ai", () => {
    beforeEach(() => {
        fetchMock.activate();
        fetchMock.disableNetConnect();
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
        expect(upload.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(upload.retentionDays).toBe(30);

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

    it("does not rewrite uploaded media on GET", async () => {
        const bucket = createTestR2Bucket();
        const env = createMediaEnv(bucket);
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
            env,
            uploadCtx,
        );
        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(bucket.putCount).toBe(1);

        const getCtx = createExecutionContext();
        const getRes = await app.fetch(
            new Request(`https://media.pollinations.ai/${upload.id}`),
            env,
            getCtx,
        );
        const body = new Uint8Array(await getRes.arrayBuffer());
        expect(getRes.status).toBe(200);
        expect(body.length).toBe(TINY_PNG.length);
        expect(bucket.putCount).toBe(1);
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

    it("?expires=7 sets retentionDays and expiresAt ~7 days from now", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "seven.png", { type: "image/png" }),
        );

        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?expires=7",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;
        expect(upload.retentionDays).toBe(7);

        const expiresAt = new Date(upload.expiresAt);
        const diffDays =
            (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeGreaterThan(6.9);
        expect(diffDays).toBeLessThan(7.1);
    });

    it("?expires=0.04 (~1h) is accepted", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "short.png", { type: "image/png" }),
        );
        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?expires=0.04",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(200);
        const upload = (await res.json()) as UploadResponse;
        expect(upload.retentionDays).toBe(0.04);
    });

    it("?expires=0 (zero) returns 400", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "x.png", { type: "image/png" }),
        );
        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?expires=0",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(400);
    });

    it("?expires negative returns 400", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "x.png", { type: "image/png" }),
        );
        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?expires=-1",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(400);
    });

    it("?expires above maximum (~2 years) returns 400", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "x.png", { type: "image/png" }),
        );
        const res = await SELF.fetch(
            "https://media.pollinations.ai/upload?expires=800",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        expect(res.status).toBe(400);
    });

    it("GET expired object returns 410", async () => {
        const bucket = createTestR2Bucket();
        const env = createMediaEnv(bucket);
        const hash = "aaaaaaaaaaaaaaaa";
        await bucket.put(hash, TINY_PNG, {
            httpMetadata: {
                contentType: "image/png",
                cacheControl: "public, max-age=31536000, immutable",
            },
            customMetadata: {
                expiresAt: new Date(Date.now() - 1000).toISOString(),
            },
        });

        const res = await app.fetch(
            new Request(`https://media.pollinations.ai/${hash}`),
            env,
            createExecutionContext(),
        );
        expect(res.status).toBe(410);
    });

    it("upload response includes expiresAt header on GET", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "header-test.png", { type: "image/png" }),
        );
        const uploadRes = await SELF.fetch(
            "https://media.pollinations.ai/upload",
            {
                method: "POST",
                body: form,
                headers: { Authorization: `Bearer ${VALID_KEY}` },
            },
        );
        const upload = (await uploadRes.json()) as UploadResponse;

        const getRes = await SELF.fetch(
            `https://media.pollinations.ai/${upload.id}`,
        );
        expect(getRes.status).toBe(200);
        await getRes.arrayBuffer();
        const xExpiresAt = getRes.headers.get("x-expires-at");
        expect(xExpiresAt).not.toBeNull();
        expect(new Date(xExpiresAt ?? "").getTime()).toBeGreaterThan(
            Date.now(),
        );
    });
});
