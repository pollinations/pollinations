import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createAudioCommand } from "./audio.js";

const originalStdinTTY = process.stdin.isTTY;
const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
    process.chdir(originalCwd);
});

describe("gen audio --timestamps", () => {
    it("posts to the with-timestamps endpoint and saves audio plus alignment JSON", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-audio-test-"));
        try {
            process.chdir(folder);
            Object.defineProperty(process.stdin, "isTTY", {
                configurable: true,
                value: true,
            });
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output: string[] = [];
            vi.spyOn(process.stdout, "write").mockImplementation((value) => {
                output.push(String(value));
                return true;
            });
            let capturedUrl = "";
            let capturedBody: Record<string, unknown> = {};
            vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
                capturedUrl = url;
                capturedBody = JSON.parse(String(init.body));
                return Response.json({
                    audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
                    alignment: { characters: ["h", "i"] },
                    normalized_alignment: { characters: ["h", "i"] },
                });
            });

            await createAudioCommand().parseAsync(
                ["hi", "--timestamps", "--voice", "nova"],
                { from: "user" },
            );

            expect(capturedUrl).toContain("/v1/audio/speech/with-timestamps");
            expect(capturedBody).toEqual({ input: "hi", voice: "nova" });
            expect([...readFileSync("speech.mp3")]).toEqual([1, 2, 3]);
            expect(JSON.parse(readFileSync("speech.json", "utf-8"))).toEqual({
                alignment: { characters: ["h", "i"] },
                normalized_alignment: { characters: ["h", "i"] },
            });
            expect(JSON.parse(output.join(""))).toMatchObject({
                path: "speech.mp3",
                timestamps: "speech.json",
            });
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
