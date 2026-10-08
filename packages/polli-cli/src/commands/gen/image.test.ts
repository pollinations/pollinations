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
    it("names the file after the response content-type when --output is omitted", async () => {
        const { folder, meta } = await run(["a small red apple"], "image/jpeg");
        try {
            expect(meta.path).toBe("image.jpg");
            expect([...readFileSync(join(folder, "image.jpg"))]).toEqual([
                1, 2, 3,
            ]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("keeps image.png when the response is PNG", async () => {
        const { folder, meta } = await run(
            ["a small red apple"],
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

    it("uses an explicit --output as given and creates missing folders", async () => {
        const { folder, meta } = await run(
            ["a fox", "--output", "out/nested/fox.png"],
            "image/jpeg",
        );
        try {
            expect(meta.path).toBe("out/nested/fox.png");
            expect([
                ...readFileSync(join(folder, "out/nested/fox.png")),
            ]).toEqual([1, 2, 3]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
