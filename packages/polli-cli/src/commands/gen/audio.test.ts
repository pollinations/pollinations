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

describe("gen audio output", () => {
    it.each([
        "mp3",
        "opus",
        "aac",
        "flac",
        "wav",
    ])("uses the requested %s format for the default filename", async (format) => {
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
            vi.stubGlobal(
                "fetch",
                async (_url: string, _init: RequestInit) =>
                    new Response(new Uint8Array([1, 2, 3])),
            );

            await createAudioCommand().parseAsync(["hi", "--format", format], {
                from: "user",
            });

            const file = `speech.${format}`;
            expect([...readFileSync(file)]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join("")).path).toBe(file);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});

describe("gen audio --timestamps", () => {
    it("saves the audio and the character timings beside it", async () => {
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
            const calls: { url: string; init: RequestInit }[] = [];
            vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
                calls.push({ url, init });
                return new Response(
                    JSON.stringify({
                        audio_base64: Buffer.from([5, 6]).toString("base64"),
                        alignment: {
                            characters: ["H", "i"],
                            character_start_times_seconds: [0, 0.1],
                            character_end_times_seconds: [0.1, 0.2],
                        },
                        normalized_alignment: null,
                    }),
                );
            });

            await createAudioCommand().parseAsync(
                ["Hi", "--timestamps", "--voice", "nova"],
                { from: "user" },
            );

            expect(new URL(calls[0].url).pathname).toBe(
                "/v1/audio/speech/with-timestamps",
            );
            expect(JSON.parse(String(calls[0].init.body))).toEqual({
                input: "Hi",
                voice: "nova",
                model: "elevenlabs/eleven-v3",
            });
            expect([...readFileSync("speech.mp3")]).toEqual([5, 6]);
            const timings = JSON.parse(
                readFileSync("speech.mp3.json", "utf-8"),
            );
            expect(timings.alignment.characters).toEqual(["H", "i"]);
            expect(timings.alignment.character_end_times_seconds).toEqual([
                0.1, 0.2,
            ]);
            expect(JSON.parse(output.join("")).timestamps).toBe(
                "speech.mp3.json",
            );
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
