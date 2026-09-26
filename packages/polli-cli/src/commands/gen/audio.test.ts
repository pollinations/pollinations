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
    it.each(["mp3", "opus", "aac", "flac", "wav"])(
        "uses the requested %s format for the default filename",
        async (format) => {
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
                vi.spyOn(process.stdout, "write").mockImplementation(
                    (value) => {
                        output.push(String(value));
                        return true;
                    },
                );
                vi.stubGlobal(
                    "fetch",
                    async (_url: string, _init: RequestInit) =>
                        new Response(new Uint8Array([1, 2, 3])),
                );

                await createAudioCommand().parseAsync(
                    ["hi", "--format", format],
                    { from: "user" },
                );

                const file = `speech.${format}`;
                expect([...readFileSync(file)]).toEqual([1, 2, 3]);
                expect(JSON.parse(output.join("")).path).toBe(file);
            } finally {
                process.chdir(originalCwd);
                rmSync(folder, { recursive: true });
            }
        },
    );
});
