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

async function inFolder(fn: (folder: string) => Promise<void>) {
    const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
    try {
        process.chdir(folder);
        await fn(folder);
    } finally {
        process.chdir(originalCwd);
        rmSync(folder, { recursive: true });
    }
}

describe("gen 3d", () => {
    it("saves a .glb file for gltf-binary responses and forwards the prompt", async () => {
        await inFolder(async () => {
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
                    headers: { "content-type": "model/gltf-binary" },
                });
            });

            await createModel3dCommand().parseAsync(
                ["a low-poly treasure chest", "--model", "hyper3d/rodin-2.5"],
                { from: "user" },
            );

            expect(requests[0]).toContain(
                "/3d/a%20low-poly%20treasure%20chest",
            );
            expect(requests[0]).toContain("model=hyper3d%2Frodin-2.5");
            expect([...readFileSync("model.glb")]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join(""))).toMatchObject({
                path: "model.glb",
                size: 3,
            });
        });
    });

    it("saves a .ply file for model/ply responses", async () => {
        await inFolder(async () => {
            setKeyOverride("sk_test");
            setOutputMode("json");
            vi.spyOn(process.stdout, "write").mockImplementation(() => true);
            vi.stubGlobal(
                "fetch",
                async () =>
                    new Response(new Uint8Array([9]), {
                        headers: { "content-type": "model/ply" },
                    }),
            );

            await createModel3dCommand().parseAsync(
                ["--image", "https://example.com/fox.png"],
                { from: "user" },
            );

            expect([...readFileSync("model.ply")]).toEqual([9]);
        });
    });

    it("rejects a local path passed to --image", async () => {
        await inFolder(async () => {
            setKeyOverride("sk_test");
            const exitSpy = vi
                .spyOn(process, "exit")
                .mockImplementation(() => undefined as never);
            vi.spyOn(process.stderr, "write").mockImplementation(() => true);
            const fetchSpy = vi.fn();
            vi.stubGlobal("fetch", fetchSpy);

            await createModel3dCommand().parseAsync(
                ["a fox", "--image", "./local.png"],
                { from: "user" },
            );

            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
