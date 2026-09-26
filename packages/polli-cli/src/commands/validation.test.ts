import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { createChatCommand } from "./gen/chat.js";
import { createTextCommand } from "./gen/text.js";
import { modelsCommand } from "./models.js";

const originalStdinTTY = process.stdin.isTTY;

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
    vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("CLI exited");
    });
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
    it.each(["bogus", "Text", ""])(
        "rejects unknown model type %j before fetching",
        async (type) => {
            const fetch = prepare();
            await expect(
                modelsCommand.parseAsync(["--type", type], { from: "user" }),
            ).rejects.toThrow("CLI exited");
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it("rejects an unknown model type in stats mode too", async () => {
        const fetch = prepare();
        await expect(
            modelsCommand.parseAsync(["--stats", "--type", "bogus"], {
                from: "user",
            }),
        ).rejects.toThrow("CLI exited");
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
        ).rejects.toThrow("CLI exited");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects a local image path before fetching", async () => {
        const fetch = prepare();
        await expect(
            createTextCommand().parseAsync(["hi", "--image", "./photo.jpg"], {
                from: "user",
            }),
        ).rejects.toThrow("CLI exited");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects invalid chat numbers before starting a session", async () => {
        const fetch = prepare();
        await expect(
            createChatCommand().parseAsync(["--temperature", "abc"], {
                from: "user",
            }),
        ).rejects.toThrow("CLI exited");
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
});
