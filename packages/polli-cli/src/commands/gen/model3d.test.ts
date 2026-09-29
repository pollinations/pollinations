import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createModel3dCommand } from "./model3d.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

function run(args: string[], contentType: string) {
    const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
    process.chdir(folder);
    setKeyOverride("sk_test");
    setOutputMode("json");
    const requests: string[] = [];
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    vi.stubGlobal("fetch", async (url: string) => {
        requests.push(url);
        return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": contentType },
        });
    });
    return createModel3dCommand()
        .parseAsync(args, { from: "user" })
        .then(() => ({
            folder,
            request: requests[0],
            meta: JSON.parse(output.join("")),
        }));
}

describe("gen 3d output", () => {
    it("saves .glb by default from a text prompt, defaulting to the text-capable model", async () => {
        const { folder, request, meta } = await run(
            ["a red fox"],
            "model/gltf-binary",
        );
        try {
            expect(request).toContain("/3d/a%20red%20fox?");
            expect(
                new URLSearchParams(request.split("?")[1]).get("model"),
            ).toBe("hyper3d/rodin-2.5");
            expect(meta.path).toBe("model.glb");
            expect([...readFileSync(join(folder, "model.glb"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("saves .ply when the response is a Gaussian Splat, defaulting to the image-only model", async () => {
        const { folder, request, meta } = await run(
            ["--image", "https://example.com/a.png"],
            "model/ply; charset=binary",
        );
        try {
            expect(
                new URLSearchParams(request.split("?")[1]).get("model"),
            ).toBe("microsoft/trellis-2");
            expect(meta.path).toBe("model.ply");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("forwards model, resolution, seed, and repeated --image", async () => {
        const { request } = await run(
            [
                "a fox",
                "--model",
                "microsoft/trellis-2",
                "--resolution",
                "high",
                "--seed",
                "7",
                "--image",
                "https://example.com/a.png",
                "--image",
                "https://example.com/b.png",
            ],
            "model/gltf-binary",
        );
        const query = new URLSearchParams(request.split("?")[1]);
        expect(query.get("model")).toBe("microsoft/trellis-2");
        expect(query.get("resolution")).toBe("high");
        expect(query.get("seed")).toBe("7");
        expect(query.get("image")).toBe(
            "https://example.com/a.png|https://example.com/b.png",
        );
    });

    it("rejects a local --image path before fetching", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        await expect(
            createModel3dCommand().parseAsync(
                ["a fox", "--image", "./photo.png"],
                { from: "user" },
            ),
        ).rejects.toThrow("exit 1");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("requires a prompt or --image", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        await expect(
            createModel3dCommand().parseAsync([], { from: "user" }),
        ).rejects.toThrow("exit 1");
        expect(fetch).not.toHaveBeenCalled();
    });
});
