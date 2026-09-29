import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createIsolateCommand, createVoiceChangeCommand } from "./voice.js";

const originalCwd = process.cwd();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

function stubFetch() {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([9, 8, 7]));
    });
    return calls;
}

function captureStdout() {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    return output;
}

describe("gen voice-change", () => {
    it("uploads the file with voice and format, and names the file after the format", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-test-"));
        try {
            process.chdir(folder);
            writeFileSync("talk.mp3", Buffer.from([1, 2]));
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output = captureStdout();
            const calls = stubFetch();

            await createVoiceChangeCommand().parseAsync(
                ["talk.mp3", "--voice", "nova", "--format", "wav"],
                { from: "user" },
            );

            expect(calls).toHaveLength(1);
            expect(new URL(calls[0].url).pathname).toBe(
                "/v1/audio/voice-changer",
            );
            const body = calls[0].init.body as FormData;
            expect(body.get("voice")).toBe("nova");
            expect(body.get("response_format")).toBe("wav");
            expect(body.get("model")).toBe(
                "elevenlabs/eleven-multilingual-sts-v2",
            );
            expect((body.get("audio") as File).name).toBe("talk.mp3");
            expect([...readFileSync("voice-change.wav")]).toEqual([9, 8, 7]);
            expect(JSON.parse(output.join("")).path).toBe("voice-change.wav");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });

    it("rejects an unsupported --format", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-test-"));
        try {
            process.chdir(folder);
            writeFileSync("talk.mp3", Buffer.from([1, 2]));
            setKeyOverride("sk_test");
            setOutputMode("json");
            const calls = stubFetch();

            await expect(
                createVoiceChangeCommand().parseAsync(
                    ["talk.mp3", "--format", "ogg"],
                    { from: "user" },
                ),
            ).rejects.toThrow();
            expect(calls).toHaveLength(0);
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});

describe("gen isolate", () => {
    it("uploads audio or video and saves the isolated speech", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-test-"));
        try {
            process.chdir(folder);
            writeFileSync("interview.mp4", Buffer.from([3, 4]));
            setKeyOverride("sk_test");
            setOutputMode("json");
            const output = captureStdout();
            const calls = stubFetch();

            await createIsolateCommand().parseAsync(["interview.mp4"], {
                from: "user",
            });

            expect(new URL(calls[0].url).pathname).toBe(
                "/v1/audio/voice-isolator",
            );
            const body = calls[0].init.body as FormData;
            expect(body.get("model")).toBe("elevenlabs/voice-isolator");
            expect((body.get("audio") as File).name).toBe("interview.mp4");
            expect([...readFileSync("isolated.mp3")]).toEqual([9, 8, 7]);
            expect(JSON.parse(output.join("")).path).toBe("isolated.mp3");
        } finally {
            process.chdir(originalCwd);
            rmSync(folder, { recursive: true });
        }
    });
});
