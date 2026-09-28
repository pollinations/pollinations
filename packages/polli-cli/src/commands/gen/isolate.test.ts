import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { setOutputMode } from "../../lib/output.js";
import { createIsolateCommand } from "./isolate.js";

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

describe("gen isolate", () => {
    it("uploads the source file and saves the cleaned speech next to it", async () => {
        const folder = mkdtempSync(join(tmpdir(), "polli-iso-test-"));
        try {
            const source = join(folder, "interview.mp4");
            writeFileSync(source, Buffer.from([7, 7, 7]));
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
                        headers: { "content-type": "audio/mpeg" },
                    }),
            );
            vi.stubGlobal("fetch", fetchMock);

            await createIsolateCommand().parseAsync([source], {
                from: "user",
            });

            const file = join(folder, "interview-isolated.mp3");
            expect([...readFileSync(file)]).toEqual([1, 2, 3]);
            expect(JSON.parse(output.join("")).path).toBe(file);

            const [url, init] = fetchMock.mock.calls[0] as [
                string,
                RequestInit,
            ];
            expect(url).toBe(
                "https://gen.pollinations.ai/v1/audio/voice-isolator",
            );
            expect(init.method).toBe("POST");
            const form = init.body as FormData;
            const audio = form.get("audio") as File;
            expect(audio.name).toBe("interview.mp4");
            expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([
                7, 7, 7,
            ]);
            expect(new Headers(init.headers).get("authorization")).toBe(
                "Bearer sk_test",
            );
        } finally {
            rmSync(folder, { recursive: true });
        }
    });
});
