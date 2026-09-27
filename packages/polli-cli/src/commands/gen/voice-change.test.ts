import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createVoiceChangeCommand } from "./voice-change.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

describe("gen voice-change", () => {
    it("uploads the source file and saves the transformed audio", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-change-test-"));
        try {
            process.chdir(folder);
            writeFileSync("talk.mp3", Buffer.from([1, 2, 3]));
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            let capturedForm: FormData | undefined;
            vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
                capturedForm = init.body as FormData;
                return new Response(new Uint8Array([9, 9]));
            });

            await createVoiceChangeCommand().parseAsync(
                ["talk.mp3", "--voice", "nova"],
                { from: "user" },
            );

            expect(capturedForm?.get("voice")).toBe("nova");
            expect((capturedForm?.get("audio") as unknown as File)?.name).toBe(
                "talk.mp3",
            );
            expect([...readFileSync("voice.mp3")]).toEqual([9, 9]);
            expect(JSON.parse(output.join(""))).toMatchObject({
                path: "voice.mp3",
                size: 2,
                voice: "nova",
            });
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
