import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createIsolateCommand } from "./isolate.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

describe("gen isolate", () => {
    it("uploads the source file and saves the isolated speech", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-isolate-test-"));
        try {
            process.chdir(folder);
            writeFileSync("interview.mp4", "source media");
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            let request: { url: string; body: FormData } | undefined;
            vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
                request = { url, body: init.body as FormData };
                return new Response(new Uint8Array([4, 5, 6]));
            });

            await createIsolateCommand().parseAsync(["interview.mp4"], {
                from: "user",
            });

            expect(request?.url).toContain("/v1/audio/voice-isolator");
            const audio = request?.body.get("audio") as Blob;
            expect(audio.size).toBe("source media".length);
            expect(audio.type).toBe("video/mp4");
            const meta = JSON.parse(output.join(""));
            expect(meta.path).toBe("isolated.mp3");
            expect([...readFileSync("isolated.mp3")]).toEqual([4, 5, 6]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
