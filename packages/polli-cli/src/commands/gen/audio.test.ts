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

    it("saves character timings alongside the audio with --timestamps", async () => {
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
            let requestPath: string | undefined;
            let requestBody: Record<string, unknown> | undefined;
            vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
                requestPath = url;
                requestBody = JSON.parse(String(init.body));
                return Response.json({
                    audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
                    alignment: { characters: ["h", "i"] },
                    normalized_alignment: { characters: ["h", "i"] },
                });
            });

            await createAudioCommand().parseAsync(["hi", "--timestamps"], {
                from: "user",
            });

            expect(requestPath).toContain("/v1/audio/speech/with-timestamps");
            expect(requestBody?.input).toBe("hi");
            expect([...readFileSync("speech.mp3")]).toEqual([1, 2, 3]);
            const alignment = JSON.parse(readFileSync("speech.json", "utf-8"));
            expect(alignment.alignment.characters).toEqual(["h", "i"]);
            const meta = JSON.parse(output.join(""));
            expect(meta.timestamps).toBe("speech.json");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("keeps the alignment JSON separate from an extension-less --output", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-audio-test-"));
        try {
            process.chdir(folder);
            Object.defineProperty(process.stdin, "isTTY", {
                configurable: true,
                value: true,
            });
            setKeyOverride("sk_test");
            setOutputMode("json");
            vi.spyOn(process.stdout, "write").mockImplementation(() => true);
            vi.stubGlobal("fetch", async () =>
                Response.json({
                    audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
                    alignment: { characters: ["h", "i"] },
                    normalized_alignment: { characters: ["h", "i"] },
                }),
            );

            await createAudioCommand().parseAsync(
                ["hi", "--timestamps", "--output", "speech"],
                { from: "user" },
            );

            expect([...readFileSync("speech")]).toEqual([1, 2, 3]);
            const alignment = JSON.parse(readFileSync("speech.json", "utf-8"));
            expect(alignment.alignment.characters).toEqual(["h", "i"]);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
