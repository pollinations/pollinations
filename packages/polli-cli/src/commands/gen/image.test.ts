import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createImageCommand } from "./image.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

describe("gen image output", () => {
    it.each([
        [[], "image/jpeg", "image.jpg"],
        [[], "image/png; charset=binary", "image.png"],
        [["--output", "out/fox.png"], "image/jpeg", "out/fox.png"],
    ])("args %j with %s saves %s", async (args, contentType, expected) => {
        const folder = mkdtempSync(join(tmpdir(), "polli-image-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        setOutputMode("json");
        const output: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((value) => {
            output.push(String(value));
            return true;
        });
        vi.stubGlobal(
            "fetch",
            async () =>
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": contentType },
                }),
        );
        try {
            await createImageCommand().parseAsync(["a fox", ...args], {
                from: "user",
            });
            expect(JSON.parse(output.join("")).path).toBe(expected);
            expect([...readFileSync(expected)]).toEqual([1, 2, 3]);
            expect(existsSync("image.png")).toBe(expected === "image.png");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});

describe("gen image size", () => {
    async function requestUrl(args: string[]) {
        const folder = mkdtempSync(join(tmpdir(), "polli-image-size-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        setOutputMode("json");
        const urls: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        vi.stubGlobal("fetch", async (input: unknown) => {
            urls.push(String(input));
            return new Response(new Uint8Array([1]), {
                headers: { "content-type": "image/jpeg" },
            });
        });
        try {
            await createImageCommand().parseAsync(["a fox", ...args], {
                from: "user",
            });
            if (!urls[0]) throw new Error("no fetch captured");
            return new URL(urls[0]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    }

    it("leaves the size to gen when no size is asked for", async () => {
        const url = await requestUrl([]);
        expect(url.searchParams.has("width")).toBe(false);
        expect(url.searchParams.has("height")).toBe(false);
    });

    it("does not force a square on edits", async () => {
        const url = await requestUrl([
            "--image",
            "https://example.com/photo.jpg",
        ]);
        expect(url.searchParams.get("image")).toBe(
            "https://example.com/photo.jpg",
        );
        expect(url.searchParams.has("width")).toBe(false);
        expect(url.searchParams.has("height")).toBe(false);
    });

    it("sends the size when it is asked for", async () => {
        const url = await requestUrl(["--width", "768", "--height", "512"]);
        expect(url.searchParams.get("width")).toBe("768");
        expect(url.searchParams.get("height")).toBe("512");
    });

    it("sends only the size that was asked for", async () => {
        const url = await requestUrl(["--width", "512"]);
        expect(url.searchParams.get("width")).toBe("512");
        expect(url.searchParams.has("height")).toBe(false);
    });

    it("still sends an explicit size on edits", async () => {
        const url = await requestUrl([
            "--image",
            "https://example.com/photo.jpg",
            "--width",
            "768",
            "--height",
            "768",
        ]);
        expect(url.searchParams.get("width")).toBe("768");
        expect(url.searchParams.get("height")).toBe("768");
    });
});
