import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { create3dCommand } from "./3d.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

function stubFetch() {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([1, 2, 3]));
    });
    return calls;
}

function captureStdout() {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    return output;
}

describe("gen 3d", () => {
    it("saves a .glb by default and sends model, resolution, seed and images", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output = captureStdout();
            const calls = stubFetch();

            await create3dCommand().parseAsync(
                [
                    "a red fox",
                    "--model",
                    "microsoft/trellis-2",
                    "--resolution",
                    "high",
                    "--seed",
                    "7",
                    "--image",
                    "https://example.com/a.png",
                    "https://example.com/b.png",
                ],
                { from: "user" },
            );

            expect(calls).toHaveLength(1);
            const url = new URL(calls[0].url);
            expect(url.pathname).toBe("/3d/a%20red%20fox");
            expect(url.searchParams.get("model")).toBe("microsoft/trellis-2");
            expect(url.searchParams.get("resolution")).toBe("high");
            expect(url.searchParams.get("seed")).toBe("7");
            expect(url.searchParams.get("image")).toBe(
                "https://example.com/a.png|https://example.com/b.png",
            );
            expect([...readFileSync("model.glb")]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join("")).path).toBe("model.glb");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("uses a .ply filename for nvidia/asset-harvester", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            setKeyOverride("sk_test");
            setOutputMode("json");
            captureStdout();
            stubFetch();

            await create3dCommand().parseAsync(
                [
                    "--model",
                    "nvidia/asset-harvester",
                    "--image",
                    "https://example.com/chair.png",
                ],
                { from: "user" },
            );

            expect([...readFileSync("model.ply")]).toEqual([1, 2, 3]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("uses the prompt placeholder for image-only models", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            setKeyOverride("sk_test");
            setOutputMode("json");
            captureStdout();
            const calls = stubFetch();

            await create3dCommand().parseAsync(
                ["--image", "https://example.com/chair.png"],
                { from: "user" },
            );

            expect(new URL(calls[0].url).pathname).toBe(
                "/3d/no_prompt_for_trellis_needed",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("explains that the default model needs --image, not just a prompt", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            setKeyOverride("sk_test");
            setOutputMode("json");
            const calls = stubFetch();

            await expect(
                create3dCommand().parseAsync(["a red fox"], { from: "user" }),
            ).rejects.toThrow();
            expect(calls).toHaveLength(0);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("rejects local paths passed to --image", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            setKeyOverride("sk_test");
            setOutputMode("json");
            const calls = stubFetch();

            await expect(
                create3dCommand().parseAsync(["--image", "./chair.png"], {
                    from: "user",
                }),
            ).rejects.toThrow();
            expect(calls).toHaveLength(0);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
