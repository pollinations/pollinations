import { describe, expect, it } from "vitest";

const BASE_URL = process.env.MEDIA_URL || "https://media.pollinations.ai";
const API_KEY = process.env.MEDIA_API_KEY || process.env.ENTER_API_TOKEN_REMOTE;

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

function requireApiKey(): string {
    if (!API_KEY)
        throw new Error("Set MEDIA_API_KEY or ENTER_API_TOKEN_REMOTE");
    return API_KEY;
}

describe("media.pollinations.ai", () => {
    it("GET / returns service info", async () => {
        const res = await fetch(BASE_URL);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.service).toBe("media.pollinations.ai");
        expect(body.endpoints.upload).toBeDefined();
    });

    it("POST /upload without key returns 401", async () => {
        const res = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            body: TINY_PNG,
            headers: { "Content-Type": "image/png" },
        });
        expect(res.status).toBe(401);
    });

    it("POST /upload with invalid key returns 401", async () => {
        const res = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            body: TINY_PNG,
            headers: {
                "Content-Type": "image/png",
                Authorization: "Bearer pk_totally_fake_key",
            },
        });
        expect(res.status).toBe(401);
    });

    it("upload, retrieve, and deduplicate", async () => {
        const form = new FormData();
        form.append(
            "file",
            new File([TINY_PNG], "test.png", { type: "image/png" }),
        );

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${requireApiKey()}` },
        });
        expect(uploadRes.status).toBe(200);
        const upload = (await uploadRes.json()) as UploadResponse;
        expect(upload.id).toMatch(/^[a-f0-9]{16}$/);
        expect(upload.url).toContain(upload.id);
        expect(upload.contentType).toBe("image/png");
        expect(upload.size).toBe(TINY_PNG.length);

        // Retrieve — check Content-Disposition includes filename
        const getRes = await fetch(`${BASE_URL}/${upload.id}`);
        expect(getRes.status).toBe(200);
        expect(getRes.headers.get("content-type")).toBe("image/png");
        expect(getRes.headers.get("cache-control")).toContain("immutable");
        expect(getRes.headers.get("content-disposition")).toContain("test.png");
        const body = new Uint8Array(await getRes.arrayBuffer());
        expect(body.length).toBe(TINY_PNG.length);

        // HEAD
        const headRes = await fetch(`${BASE_URL}/${upload.id}`, {
            method: "HEAD",
        });
        expect(headRes.status).toBe(200);
        expect(headRes.headers.get("x-content-hash")).toBe(upload.id);

        // Duplicate re-upload returns same hash
        const dupForm = new FormData();
        dupForm.append(
            "file",
            new File([TINY_PNG], "test.png", { type: "image/png" }),
        );

        const dupRes = await fetch(`${BASE_URL}/upload`, {
            method: "POST",
            body: dupForm,
            headers: { Authorization: `Bearer ${requireApiKey()}` },
        });
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

        const [res1, res2] = await Promise.all([
            fetch(`${BASE_URL}/upload`, {
                method: "POST",
                body: form1,
                headers: { Authorization: `Bearer ${requireApiKey()}` },
            }),
            fetch(`${BASE_URL}/upload`, {
                method: "POST",
                body: form2,
                headers: { Authorization: `Bearer ${requireApiKey()}` },
            }),
        ]);

        const upload1 = (await res1.json()) as UploadResponse;
        const upload2 = (await res2.json()) as UploadResponse;
        expect(upload1.id).not.toBe(upload2.id);
    });

    it("GET /:invalid-hash returns 400", async () => {
        const res = await fetch(`${BASE_URL}/not-a-valid-hash`);
        expect(res.status).toBe(400);
    });

    it("GET /:nonexistent-hash returns 404", async () => {
        const res = await fetch(`${BASE_URL}/0000000000000000`);
        expect(res.status).toBe(404);
    });
});
