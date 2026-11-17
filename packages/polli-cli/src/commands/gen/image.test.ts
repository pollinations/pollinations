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

    it("leaves the size to the server unless --width or --height is given", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-image-test-"));
        process.chdir(folder);
        setKeyOverride("sk_test");
        setOutputMode("json");
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const urls: string[] = [];
        vi.stubGlobal("fetch", async (url: string) => {
            urls.push(url);
            return new Response(new Uint8Array([1]), {
                headers: { "content-type": "image/png" },
            });
        });
        try {
            for (const args of [[], ["--width", "640"]]) {
                await createImageCommand().parseAsync(["a fox", ...args], {
                    from: "user",
                });
            }
            const [defaults, sized] = urls.map((u) => new URL(u).searchParams);
            expect(defaults.has("width")).toBe(false);
            expect(defaults.has("height")).toBe(false);
            expect(sized.get("width")).toBe("640");
            expect(sized.has("height")).toBe(false);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
