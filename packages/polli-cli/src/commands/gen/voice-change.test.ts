import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createVoiceChangeCommand } from "./voice-change.js";

const originalStdoutTTY = process.stdout.isTTY;
const originalStdinTTY = process.stdin.isTTY;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: originalStdoutTTY,
    });
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
});

function audioFixture(folder: string): string {
    const file = join(folder, "talk.mp3");
    writeFileSync(file, Buffer.from([9, 9, 9]));
    return file;
}

describe("gen voice-change", () => {
    it("uploads the source audio and follows --format for the default filename", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-vc-test-"));
        try {
            const source = audioFixture(folder);
            Object.defineProperty(process.stdin, "isTTY", {
                configurable: true,
                value: true,
            });
            Object.defineProperty(process.stdout, "isTTY", {
                configurable: true,
                value: false,
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
                    new Response(new Uint8Array([1, 2, 3]), {
                        headers: { "content-type": "audio/wav" },
                    }),
            );
            vi.stubGlobal("fetch", fetchMock);

            await createVoiceChangeCommand().parseAsync(
                [source, "--voice", "nova", "--format", "wav"],
                { from: "user" },
            );

            const file = join(folder, "talk-voiced.wav");
            expect([...readFileSync(file)]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join("")).path).toBe(file);

            const [url, init] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            expect(url).toBe(
                "https://gen.pollinations.ai/v1/audio/voice-changer",
            );
            expect(init.method).toBe("POST");
            const form = init.body as FormData;
            expect(form.get("voice")).toBe("nova");
            expect(form.get("response_format")).toBe("wav");
            const audio = form.get("audio") as File;
            expect(audio.name).toBe("talk.mp3");
            expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([
                9, 9, 9,
            ]);
            expect(new Headers(init.headers).get("authorization")).toBe(
                "Bearer sk_test",
            );
        } finally {
            rmSync(folder, { recursive: true });
        }
    });
});
