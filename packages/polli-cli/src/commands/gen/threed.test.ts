import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { create3dCommand } from "./threed.js";

const originalStdoutTTY = process.stdout.isTTY;
const originalStdinTTY = process.stdin.isTTY;
const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: originalStdoutTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
    process.chdir(originalCwd);
});

describe("gen 3d", () => {
    it("generates a GLB with the default filename and sends the model query", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            Object.defineProperty(process.stdin, "isTTY", {
                configurable: true,
                value: true,
            });
            Object.defineProperty(process.stdout, "isTTY", {
                configurable: true,
                value: false,
            });
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            const fetchMock = vi.fn(
                async (_url: string, _init?: RequestInit) =>
                    new Response(new Uint8Array([1, 2, 3]), {
                        headers: { "content-type": "model/gltf-binary" },
                    }),
            );
            vi.stubGlobal("fetch", fetchMock);

            await create3dCommand().parseAsync(
                ["a red fox", "--model", "hyper3d/rodin-2.5", "--seed", "7"],
                { from: "user" },
            );

            const file = "model.glb";
            expect([...readFileSync(file)]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join("")).path).toBe(file);

            const [url, init] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            expect(new URL(url).pathname).toBe("/3d/a%20red%20fox");
            expect(new URL(url).searchParams.get("model")).toBe(
                "hyper3d/rodin-2.5",
            );
            expect(new URL(url).searchParams.get("seed")).toBe("7");
            expect(new Headers(init.headers).get("authorization")).toBe(
                "Bearer sk_test",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("derives the .ply extension for asset-harvester and passes reference image URLs", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-3d-test-"));
        try {
            process.chdir(folder);
            Object.defineProperty(process.stdin, "isTTY", {
                configurable: true,
                value: true,
            });
            Object.defineProperty(process.stdout, "isTTY", {
                configurable: true,
                value: false,
            });
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            const fetchMock = vi.fn(
                async (_url: string, _init?: RequestInit) =>
                    new Response(new Uint8Array([4, 5]), {
                        headers: { "content-type": "model/ply" },
                    }),
            );
            vi.stubGlobal("fetch", fetchMock);

            await create3dCommand().parseAsync(
                [
                    "--model",
                    "nvidia/asset-harvester",
                    "--image",
                    "https://media.pollinations.ai/abc",
                    "--output",
                    "harvest.ply",
                ],
                { from: "user" },
            );

            const file = "harvest.ply";
            expect([...readFileSync(file)]).toEqual([4, 5]);
            expect(JSON.parse(output.join("")).path).toBe(file);

            const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(new URL(url).searchParams.get("image")).toBe(
                "https://media.pollinations.ai/abc",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("rejects local paths for --image before calling the API", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        setKeyOverride("sk_test");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        vi.spyOn(process, "exit").mockImplementation((code) => {
            throw new Error(`process.exit(${code})`);
        });

        await expect(
            create3dCommand().parseAsync(["--image", "./photo.png"], {
                from: "user",
            }),
        ).rejects.toThrow("process.exit(1)");

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
