import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createAudioCommand } from "./audio.js";

const timestampResponse = {
    audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
    alignment: {
        characters: ["h", "i"],
        character_start_times_seconds: [0, 0.2],
        character_end_times_seconds: [0.2, 0.4],
    },
    normalized_alignment: {
        characters: ["h", "i"],
        character_start_times_seconds: [0, 0.2],
        character_end_times_seconds: [0.2, 0.4],
    },
};

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
    it("saves the audio and the character timings as JSON next to it", async () => {
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
            const fetchMock = vi.fn(
                async (_url: string, _init?: RequestInit) =>
                    new Response(JSON.stringify(timestampResponse)),
            );
            vi.stubGlobal("fetch", fetchMock);

            await createAudioCommand().parseAsync(
                ["hi", "--timestamps", "--voice", "nova"],
                { from: "user" },
            );

            expect([...readFileSync("speech.mp3")]).toEqual([1, 2, 3]);
            const timings = JSON.parse(
                readFileSync("speech.timings.json", "utf-8"),
            );
            expect(timings.alignment.characters).toEqual(["h", "i"]);
            expect(timings.normalized_alignment).toBeDefined();
            expect(JSON.parse(output.join("")).timings).toBe(
                "speech.timings.json",
            );

            const [url, init] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            expect(url).toBe(
                "https://gen.pollinations.ai/v1/audio/speech/with-timestamps",
            );
            expect(init.method).toBe("POST");
            expect(JSON.parse(String(init.body))).toEqual({
                input: "hi",
                voice: "nova",
                response_format: "mp3",
            });
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
