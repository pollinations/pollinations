/**
 * Basic tests for media.pollinations.ai
 * 
 * Run with: wrangler test test.ts
 * Or use these as examples for manual testing with wrangler dev
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "./src/index";

// Mock R2 bucket for testing
class MockR2Bucket {
    private store: Map<
        string,
        { data: ArrayBuffer; metadata: any; httpMetadata: any }
    > = new Map();

    async put(key: string, value: ArrayBuffer, options: any) {
        this.store.set(key, { data: value, metadata: options.customMetadata, httpMetadata: options.httpMetadata });
    }

    async get(key: string) {
        const item = this.store.get(key);
        if (!item) return null;
        return {
            body: item.data,
            size: item.data.byteLength,
            httpMetadata: item.httpMetadata,
            customMetadata: item.metadata,
        };
    }

    async head(key: string) {
        const item = this.store.get(key);
        if (!item) return null;
        return {
            size: item.data.byteLength,
            httpMetadata: item.httpMetadata,
            customMetadata: item.metadata,
        };
    }

    clear() {
        this.store.clear();
    }
}

// Create mock environment
const mockEnv = {
    MEDIA_BUCKET: new MockR2Bucket() as any,
    MAX_FILE_SIZE: "10485760",
};

describe("media.pollinations.ai", () => {
    describe("POST /upload", () => {
        it("should accept multipart/form-data and return hash", async () => {
            const formData = new FormData();
            const blob = new Blob(
                [new Uint8Array([0x89, 0x50, 0x4e, 0x47])], // PNG magic bytes
                { type: "image/png" },
            );
            formData.append("file", blob, "test.png");

            const req = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });

            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(200);

            const data = await res.json() as any;
            expect(data.id).toBeDefined();
            expect(data.id).toMatch(/^[a-f0-9]{64}$/i);
            expect(data.url).toContain(data.id);
            expect(data.contentType).toBe("image/png");
            expect(data.duplicate).toBe(false);
        });

        it("should accept base64 JSON and return hash", async () => {
            const req = new Request("http://localhost/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                    contentType: "image/png",
                    name: "test.png",
                }),
            });

            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(200);

            const data = await res.json() as any;
            expect(data.id).toBeDefined();
            expect(data.id).toMatch(/^[a-f0-9]{64}$/i);
            expect(data.contentType).toBe("image/png");
        });

        it("should return 400 for empty file", async () => {
            const formData = new FormData();
            formData.append("file", new Blob([], { type: "image/png" }), "empty.png");

            const req = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });

            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(400);
        });

        it("should return 400 for missing file", async () => {
            const formData = new FormData();

            const req = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });

            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(400);
        });

        it("should return 415 for invalid content type", async () => {
            const formData = new FormData();
            const blob = new Blob([new Uint8Array([0x42, 0x4d])], { type: "application/pdf" });
            formData.append("file", blob, "test.pdf");

            const req = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });

            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(415);
        });

        it("should deduplicate identical files", async () => {
            const blob = new Blob(
                [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
                { type: "image/png" },
            );

            // First upload
            const formData1 = new FormData();
            formData1.append("file", blob, "test1.png");
            const req1 = new Request("http://localhost/upload", {
                method: "POST",
                body: formData1,
            });
            const res1 = await app.fetch(req1, mockEnv);
            const data1 = await res1.json() as any;

            // Second upload (identical content)
            const formData2 = new FormData();
            formData2.append("file", blob.slice(), "test2.png");
            const req2 = new Request("http://localhost/upload", {
                method: "POST",
                body: formData2,
            });
            const res2 = await app.fetch(req2, mockEnv);
            const data2 = await res2.json() as any;

            // Should have same hash
            expect(data1.id).toBe(data2.id);
            expect(data2.duplicate).toBe(true);
        });
    });

    describe("GET /:hash", () => {
        it("should retrieve uploaded file by hash", async () => {
            // First, upload a file
            const formData = new FormData();
            const testData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
            const blob = new Blob([testData], { type: "image/png" });
            formData.append("file", blob, "test.png");

            const uploadReq = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });
            const uploadRes = await app.fetch(uploadReq, mockEnv);
            const uploadData = await uploadRes.json() as any;
            const hash = uploadData.id;

            // Now retrieve it
            const retrieveReq = new Request(`http://localhost/${hash}`, {
                method: "GET",
            });
            const retrieveRes = await app.fetch(retrieveReq, mockEnv);
            expect(retrieveRes.status).toBe(200);
            expect(retrieveRes.headers.get("Content-Type")).toBe("image/png");
            expect(retrieveRes.headers.get("X-Content-Hash")).toBe(hash);
        });

        it("should return 404 for non-existent hash", async () => {
            const req = new Request(
                "http://localhost/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                { method: "GET" },
            );
            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(404);
        });

        it("should return 400 for invalid hash format", async () => {
            const req = new Request("http://localhost/invalid-hash", { method: "GET" });
            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(400);
        });
    });

    describe("HEAD /:hash", () => {
        it("should return metadata without body", async () => {
            // First, upload a file
            const formData = new FormData();
            const blob = new Blob(
                [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
                { type: "image/png" },
            );
            formData.append("file", blob, "test.png");

            const uploadReq = new Request("http://localhost/upload", {
                method: "POST",
                body: formData,
            });
            const uploadRes = await app.fetch(uploadReq, mockEnv);
            const uploadData = await uploadRes.json() as any;
            const hash = uploadData.id;

            // HEAD request
            const headReq = new Request(`http://localhost/${hash}`, { method: "HEAD" });
            const headRes = await app.fetch(headReq, mockEnv);
            expect(headRes.status).toBe(200);
            expect(headRes.headers.get("X-Content-Hash")).toBe(hash);
            expect(headRes.headers.get("Content-Type")).toBe("image/png");
        });
    });

    describe("GET /", () => {
        it("should return service info", async () => {
            const req = new Request("http://localhost/", { method: "GET" });
            const res = await app.fetch(req, mockEnv);
            expect(res.status).toBe(200);

            const data = await res.json() as any;
            expect(data.service).toBe("media.pollinations.ai");
            expect(data.endpoints).toBeDefined();
            expect(data.limits).toBeDefined();
        });
    });
});

// Manual testing guide
console.log(`
🧪 Manual Testing with wrangler dev

1. Start dev server:
   wrangler dev

2. Test multipart upload:
   curl -X POST http://localhost:8790/upload \\
     -F "file=@test.png"

3. Test base64 upload:
   curl -X POST http://localhost:8790/upload \\
     -H "Content-Type: application/json" \\
     -d '{"data":"iVBORw0KG...","contentType":"image/png","name":"test.png"}'

4. Retrieve file:
   curl http://localhost:8790/{hash}

5. Check metadata:
   curl -I http://localhost:8790/{hash}

6. Test deduplication:
   curl -X POST http://localhost:8790/upload -F "file=@test.png"
   curl -X POST http://localhost:8790/upload -F "file=@test.png"
   # Both should return the same hash with duplicate=true on second
`);
