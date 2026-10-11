import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createVideoCommand } from "./video.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

describe("gen video command", () => {
    it("defaults to 1024x1024 when no aspect-ratio or dimensions are given", async () => {
        let requestedUrl = "";
        vi.stubGlobal("fetch", async (url: string | URL) => {
            requestedUrl = String(url);
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "video/mp4" },
            });
        });

        const folder = mkdtempSync(join(tmpdir(), "polli-video-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        try {
            await createVideoCommand().parseAsync(["waves crashing"], {
                from: "user",
            });
            const url = new URL(requestedUrl);
            expect(url.searchParams.get("width")).toBe("1024");
            expect(url.searchParams.get("height")).toBe("1024");
            expect(url.searchParams.get("aspectRatio")).toBeNull();
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("omits default 1024x1024 when --aspect-ratio is specified", async () => {
        let requestedUrl = "";
        vi.stubGlobal("fetch", async (url: string | URL) => {
            requestedUrl = String(url);
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "video/mp4" },
            });
        });

        const folder = mkdtempSync(join(tmpdir(), "polli-video-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        try {
            await createVideoCommand().parseAsync(
                ["waves crashing", "--aspect-ratio", "16:9"],
                { from: "user" },
            );
            const url = new URL(requestedUrl);
            expect(url.searchParams.get("aspectRatio")).toBe("16:9");
            expect(url.searchParams.get("width")).toBeNull();
            expect(url.searchParams.get("height")).toBeNull();
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("forwards multiple reference image URLs separated by pipe", async () => {
        let requestedUrl = "";
        vi.stubGlobal("fetch", async (url: string | URL) => {
            requestedUrl = String(url);
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "video/mp4" },
            });
        });

        const folder = mkdtempSync(join(tmpdir(), "polli-video-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        try {
            await createVideoCommand().parseAsync(
                [
                    "interpolate",
                    "--image",
                    "https://example.com/start.png",
                    "https://example.com/end.png",
                ],
                { from: "user" },
            );
            const url = new URL(requestedUrl);
            expect(url.searchParams.get("image")).toBe(
                "https://example.com/start.png|https://example.com/end.png",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("rejects non-http(s) reference image path", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-video-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        try {
            await expect(
                createVideoCommand().parseAsync(
                    ["interpolate", "--image", "./local.png"],
                    { from: "user" },
                ),
            ).rejects.toThrow();
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
