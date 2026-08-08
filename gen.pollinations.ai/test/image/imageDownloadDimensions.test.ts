import { describe, expect, it } from "vitest";
import {
    getSourceImageDimensions,
    readImageDimensions,
} from "../../src/image/utils/imageDownload.ts";

function dataUri(bytes: Uint8Array, mimeType: string): string {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function makeKv() {
    const store = new Map<string, string>();
    const puts: string[] = [];
    return {
        store,
        puts,
        async get(key: string, _type?: "json") {
            const raw = store.get(key);
            return raw === undefined ? null : JSON.parse(raw);
        },
        async put(key: string, value: string) {
            puts.push(key);
            store.set(key, value);
        },
    } as unknown as KVNamespace & { puts: string[] };
}

describe("readImageDimensions", () => {
    it("reads PNG dimensions", () => {
        const png = new Uint8Array(24);
        png.set([0x89, 0x50, 0x4e, 0x47]);
        new DataView(png.buffer).setUint32(16, 1920, false);
        new DataView(png.buffer).setUint32(20, 1080, false);
        expect(readImageDimensions(png, "image/png")).toEqual({
            width: 1920,
            height: 1080,
        });
    });

    it("reads JPEG dimensions", () => {
        const jpeg = Uint8Array.from([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x02, 0xd0, 0x05, 0x00,
            0x03, 0x01, 0x11, 0x00,
        ]);
        expect(readImageDimensions(jpeg, "image/jpeg")).toEqual({
            width: 1280,
            height: 720,
        });
    });

    it("reads WEBP VP8X dimensions", () => {
        const webp = new Uint8Array(30);
        webp.set([0x52, 0x49, 0x46, 0x46], 0);
        webp.set([0x57, 0x45, 0x42, 0x50], 8);
        webp.set([0x56, 0x50, 0x38, 0x58], 12);
        webp[24] = 0xff;
        webp[25] = 0x03;
        webp[27] = 0xff;
        webp[28] = 0x01;
        expect(readImageDimensions(webp, "image/webp")).toEqual({
            width: 1024,
            height: 512,
        });
    });
});

describe("getSourceImageDimensions", () => {
    it("reads inline image data without fetching", async () => {
        const png = new Uint8Array(24);
        png.set([0x89, 0x50, 0x4e, 0x47]);
        new DataView(png.buffer).setUint32(16, 768, false);
        new DataView(png.buffer).setUint32(20, 1024, false);
        await expect(
            getSourceImageDimensions(dataUri(png, "image/png")),
        ).resolves.toEqual({
            width: 768,
            height: 1024,
        });
    });

    it("returns null for unreadable input", async () => {
        await expect(
            getSourceImageDimensions("data:text/plain;base64,aGVsbG8="),
        ).resolves.toBeNull();
    });

    it("caches remote dimensions in KV and reads the persisted value", async () => {
        const kv = makeKv();
        const originalFetch = globalThis.fetch;
        let fetches = 0;
        globalThis.fetch = async () => {
            fetches += 1;
            const png = new Uint8Array(24);
            png.set([0x89, 0x50, 0x4e, 0x47]);
            new DataView(png.buffer).setUint32(16, 2048, false);
            new DataView(png.buffer).setUint32(20, 1024, false);
            return new Response(png, { status: 200 });
        };
        try {
            await expect(
                getSourceImageDimensions("https://example.com/source.png", kv),
            ).resolves.toEqual({ width: 2048, height: 1024 });
            await expect(
                getSourceImageDimensions("https://example.com/source.png", kv),
            ).resolves.toEqual({ width: 2048, height: 1024 });
            expect(fetches).toBe(1);
            expect(kv.puts).toHaveLength(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("does not cache inline data URIs", async () => {
        const kv = makeKv();
        const png = new Uint8Array(24);
        png.set([0x89, 0x50, 0x4e, 0x47]);
        new DataView(png.buffer).setUint32(16, 768, false);
        new DataView(png.buffer).setUint32(20, 1024, false);
        await expect(
            getSourceImageDimensions(dataUri(png, "image/png"), kv),
        ).resolves.toEqual({ width: 768, height: 1024 });
        expect(kv.puts).toHaveLength(0);
    });
});
