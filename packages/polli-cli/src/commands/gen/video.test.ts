import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { createVideoCommand } from "./video.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    process.chdir(originalCwd);
});

describe("gen video request", () => {
    it("sends --aspect-ratio without a default size and joins --image frames", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-video-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        const requests: string[] = [];
        vi.stubGlobal("fetch", async (url: string) => {
            requests.push(url);
            return new Response(new Uint8Array([1, 2, 3]));
        });
        try {
            await createVideoCommand().parseAsync(
                [
                    "waves",
                    "--aspect-ratio",
                    "16:9",
                    "--image",
                    "https://example.com/start.png",
                    "https://example.com/end.png",
                ],
                { from: "user" },
            );
            const params = new URLSearchParams(requests[0].split("?")[1]);
            expect(params.get("aspectRatio")).toBe("16:9");
            expect(params.has("width")).toBe(false);
            expect(params.has("height")).toBe(false);
            expect(params.get("image")).toBe(
                "https://example.com/start.png|https://example.com/end.png",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
