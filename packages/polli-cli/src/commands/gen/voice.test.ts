import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetOutput, runCommand } from "./test-helpers.js";
import { createIsolateCommand, createVoiceChangeCommand } from "./voice.js";

afterEach(resetOutput);

const audio = (type: string) =>
    new Response(new Uint8Array([5, 5]), { headers: { "content-type": type } });

/** The two commands take a local file, so each test writes one. */
const withSource = (name: string, argv: (source: string) => string[]) => {
    const folder = mkdtempSync(join(tmpdir(), "polli-voice-"));
    const source = join(folder, name);
    writeFileSync(source, new Uint8Array([9, 9]));
    return { folder, argv: argv(source) };
};

describe("gen voice-change", () => {
    it("uploads the file and names the output from the response format", async () => {
        const { folder, argv } = withSource("talk.mp3", (s) => [
            s,
            "--voice",
            "nova",
        ]);
        try {
            await runCommand(
                createVoiceChangeCommand(),
                argv,
                () => audio("audio/opus"),
                ({ out, calls }) => {
                    expect(JSON.parse(out).path).toBe("voice-change.opus");
                    expect(calls[0].url).toContain("/v1/audio/voice-changer");
                    // The multipart body carries the voice and the file itself.
                    const body = calls[0].init.body as FormData;
                    expect(body.get("voice")).toBe("nova");
                },
            );
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });
});

describe("gen isolate", () => {
    it("posts to the isolator endpoint", async () => {
        const { folder, argv } = withSource("interview.mp4", (s) => [s]);
        try {
            await runCommand(
                createIsolateCommand(),
                argv,
                () => audio("audio/mpeg"),
                ({ calls }) => {
                    expect(calls[0].url).toContain("/v1/audio/voice-isolator");
                },
            );
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });
});
