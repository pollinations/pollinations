import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import { agentsCommand } from "./agents.js";
import { createAudioCommand } from "./gen/audio.js";
import { createChatCommand } from "./gen/chat.js";
import { createImageCommand } from "./gen/image.js";
import { createModel3dCommand } from "./gen/model3d.js";
import { createTextCommand } from "./gen/text.js";
import { createVideoCommand } from "./gen/video.js";
import { keysCommand } from "./keys.js";
import { modelsCommand } from "./models.js";

const originalStdinTTY = process.stdin.isTTY;
const mediaCommands: Record<string, typeof createImageCommand> = {
    image: createImageCommand,
    video: createVideoCommand,
    audio: createAudioCommand,
    "3d": createModel3dCommand,
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
    });
});

function prepare() {
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: true,
    });
    setKeyOverride("sk_test");
    setOutputMode("json");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json({
            choices: [{ message: { content: "ok" } }],
            model: "test",
        }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("CLI argument validation", () => {
    it("prints an invalid key budget only once", async () => {
        const fetch = prepare();
        await expect(
            keysCommand.parseAsync(
                ["create", "--name", "test", "--budget", "-1"],
                { from: "user" },
            ),
        ).rejects.toThrow(ExitSignal);
        expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
            [expect.stringContaining("--budget must be a non-negative number")],
        ]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("prints an invalid agent option only once", async () => {
        const fetch = prepare();
        await expect(
            agentsCommand.parseAsync(
                [
                    "create",
                    "--config",
                    "unused.json",
                    "--visibility",
                    "invalid",
                ],
                { from: "user" },
            ),
        ).rejects.toThrow(ExitSignal);
        expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
            [
                expect.stringContaining(
                    "--visibility must be 'private' or 'public'",
                ),
            ],
        ]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        "bogus",
        "Text",
        "",
    ])("rejects unknown model type %j before fetching", async (type) => {
        const fetch = prepare();
        await expect(
            modelsCommand.parseAsync(["--type", type], { from: "user" }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("fetches only /3d/models for --type 3d", async () => {
        prepare();
        const fetch = vi.fn(async (url: string) =>
            url.includes("/3d/models")
                ? Response.json([
                      {
                          name: "microsoft/trellis-2",
                          output_modalities: ["3d"],
                      },
                  ])
                : Response.json([]),
        );
        vi.stubGlobal("fetch", fetch);
        await modelsCommand.parseAsync(["--type", "3d"], { from: "user" });
        const urls = fetch.mock.calls.map(([url]) => url as string);
        expect(urls).toEqual([expect.stringContaining("/3d/models")]);
    });

    it("rejects an unknown model type in stats mode too", async () => {
        const fetch = prepare();
        await expect(
            modelsCommand.parseAsync(["--stats", "--type", "bogus"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        ["--temperature", "abc"],
        ["--temperature", "-99"],
        ["--max-tokens", "1.5"],
        ["--top-p", "Infinity"],
        ["--frequency-penalty", "abc"],
        ["--presence-penalty", "3"],
        ["--seed", "1.2"],
    ])("rejects invalid text %s %s before fetching", async (flag, value) => {
        const fetch = prepare();
        await expect(
            createTextCommand().parseAsync(["hi", flag, value], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects a local image path before fetching", async () => {
        const fetch = prepare();
        await expect(
            createTextCommand().parseAsync(["hi", "--image", "./photo.jpg"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects invalid chat numbers before starting a session", async () => {
        const fetch = prepare();
        await expect(
            createChatCommand().parseAsync(["--temperature", "abc"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("sends valid numeric options and an HTTP image URL", async () => {
        const fetch = prepare();
        await createTextCommand().parseAsync(
            [
                "hi",
                "--no-stream",
                "--temperature",
                "0.5",
                "--seed",
                "-1",
                "--image",
                "https://example.com/image.png",
            ],
            { from: "user" },
        );
        const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
        expect(body.temperature).toBe(0.5);
        expect(body.seed).toBe(-1);
        expect(body.messages[0].content[1].image_url.url).toBe(
            "https://example.com/image.png",
        );
    });

    it.each([
        [
            "image",
            "--width",
            "abc",
            "--width must be an integer between 1 and 4096",
        ],
        [
            "image",
            "--height",
            "-5",
            "--height must be an integer between 1 and 4096",
        ],
        ["image", "--width", "512.5", "--width must be an integer"],
        ["image", "--seed", "abc", "--seed must be an integer"],
        ["video", "--width", "abc", "--width must be an integer"],
        [
            "video",
            "--duration",
            "999",
            "--duration must be an integer between 1 and 30",
        ],
        [
            "video",
            "--duration",
            "0",
            "--duration must be an integer between 1 and 30",
        ],
        ["video", "--seed", "1.5", "--seed must be an integer"],
        [
            "audio",
            "--speed",
            "9",
            "--speed must be a number between 0.25 and 4",
        ],
        [
            "audio",
            "--speed",
            "abc",
            "--speed must be a number between 0.25 and 4",
        ],
        ["audio", "--duration", "abc", "--duration must be a number"],
        ["audio", "--seed", "abc", "--seed must be an integer"],
        ["3d", "--seed", "abc", "--seed must be an integer"],
    ])("rejects invalid gen %s %s %s before fetching", async (command, flag, value, message) => {
        const fetch = prepare();
        await expect(
            mediaCommands[command]().parseAsync(["hi", flag, value], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
            [expect.stringContaining(message)],
        ]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        [
            "image",
            ["--width", "512", "--height", "768", "--seed", "-1"],
            { width: "512", height: "768", seed: "-1" },
        ],
        [
            "video",
            ["--duration", "5", "--seed", "0"],
            { width: "1024", height: "1024", duration: "5", seed: "0" },
        ],
        [
            "audio",
            ["--speed", "1.5", "--duration", "30", "--seed", "0"],
            { speed: "1.5", duration: "30", seed: "0" },
        ],
        ["3d", ["--seed", "42"], { seed: "42" }],
    ])("sends valid gen %s numbers to the API", async (command, args, expected) => {
        const fetch = prepare();
        const folder = mkdtempSync(join(tmpdir(), "polli-validation-test-"));
        try {
            await mediaCommands[command]().parseAsync(
                ["hi", ...args, "--output", join(folder, "out")],
                { from: "user" },
            );
            const query = new URLSearchParams(
                String(fetch.mock.calls[0]?.[0]).split("?")[1],
            );
            for (const [key, value] of Object.entries(expected))
                expect(query.get(key)).toBe(value);
        } finally {
            rmSync(folder, { recursive: true });
        }
    });
});
