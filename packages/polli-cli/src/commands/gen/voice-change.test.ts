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
    it("uploads the source file and saves the transformed voice", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-change-test-"));
        try {
            process.chdir(folder);
            writeFileSync("talk.mp3", "source audio");
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
                return new Response(new Uint8Array([1, 2, 3]));
            });

            await createVoiceChangeCommand().parseAsync(
                ["talk.mp3", "--voice", "nova"],
                { from: "user" },
            );

            expect(request?.url).toContain("/v1/audio/voice-changer");
            expect(request?.body.get("voice")).toBe("nova");
            expect((request?.body.get("audio") as Blob).size).toBe(
                "source audio".length,
            );
            const meta = JSON.parse(output.join(""));
            expect(meta.path).toBe("voice.mp3");
            expect([...readFileSync("voice.mp3")]).toEqual([1, 2, 3]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
