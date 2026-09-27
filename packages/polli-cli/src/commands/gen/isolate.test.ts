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
    it("uploads the source file and saves the cleaned speech", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-isolate-test-"));
        try {
            process.chdir(folder);
            writeFileSync("interview.mp4", Buffer.from([1, 2, 3, 4]));
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            let capturedUrl = "";
            let capturedForm: FormData | undefined;
            vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
                capturedUrl = url;
                capturedForm = init.body as FormData;
                return new Response(new Uint8Array([5, 5, 5]));
            });

            await createIsolateCommand().parseAsync(["interview.mp4"], {
                from: "user",
            });

            expect(capturedUrl).toContain("/v1/audio/voice-isolator");
            expect((capturedForm?.get("audio") as unknown as File)?.name).toBe(
                "interview.mp4",
            );
            expect([...readFileSync("isolated.mp3")]).toEqual([5, 5, 5]);
            expect(JSON.parse(output.join(""))).toMatchObject({
                path: "isolated.mp3",
                size: 3,
            });
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
