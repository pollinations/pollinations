import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function run(args: string[], contentType: string) {
    const folder = mkdtempSync(join(tmpdir(), "polli-image-test-"));
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
    return createImageCommand()
        .parseAsync(args, { from: "user" })
        .then(() => ({
            folder,
            request: requests[0],
            meta: JSON.parse(output.join("")),
        }));
}

describe("gen image output", () => {
    it("names the file after the returned content type (jpeg -> image.jpg)", async () => {
        const { folder, request, meta } = await run(
            ["a red fox"],
            "image/jpeg; charset=binary",
        );
        try {
            expect(request).toContain("/image/a%20red%20fox?");
            expect(meta.path).toBe("image.jpg");
            expect([...readFileSync(join(folder, "image.jpg"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("uses image.png when the response is PNG", async () => {
        const { folder, meta } = await run(["a red fox"], "image/png");
        try {
            expect(meta.path).toBe("image.png");
            expect([...readFileSync(join(folder, "image.png"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("honors an explicit --output as given", async () => {
        const { folder, meta } = await run(
            ["a red fox", "--output", "custom.jpg"],
            "image/jpeg",
        );
        try {
            expect(meta.path).toBe("custom.jpg");
            expect([...readFileSync(join(folder, "custom.jpg"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
