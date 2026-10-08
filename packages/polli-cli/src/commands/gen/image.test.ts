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
    it("names the default output .jpg when the response is JPEG", async () => {
        const { folder, meta } = await run(["a red apple"], "image/jpeg");
        try {
            expect(meta.path).toBe("image.jpg");
            expect(existsSync(join(folder, "image.jpg"))).toBe(true);
            expect(existsSync(join(folder, "image.png"))).toBe(false);
            expect([...readFileSync(join(folder, "image.jpg"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("names the default output .png when the response is PNG", async () => {
        const { folder, meta } = await run(
            ["a red apple"],
            "image/png; charset=binary",
        );
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

    it("uses an explicit --output as given", async () => {
        const { folder, meta } = await run(
            ["a red apple", "--output", "out/nested/picture.jpeg"],
            "image/jpeg",
        );
        try {
            expect(meta.path).toBe("out/nested/picture.jpeg");
            expect([
                ...readFileSync(join(folder, "out/nested/picture.jpeg")),
            ]).toEqual([1, 2, 3]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
