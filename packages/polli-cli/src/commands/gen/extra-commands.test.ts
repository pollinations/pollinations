import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../../lib/config.js";
import { type OutputMode, setOutputMode } from "../../lib/output.js";
import { createEmbeddingsCommand } from "./embeddings.js";
import { create3dCommand } from "./three-d.js";
import { createIsolateCommand, createVoiceChangeCommand } from "./voice.js";

const originalCwd = process.cwd();

interface Call {
    url: string;
    init: RequestInit;
}
interface Ctx {
    out: string;
    calls: Call[];
    folder: string;
}

/** Capture stdout, stub the API, run a command in a throwaway cwd, assert. */
const run = async (
    command: {
        parseAsync: (
            argv: string[],
            opts: { from: string },
        ) => Promise<unknown>;
    },
    argv: string[],
    respond: (url: string, init: RequestInit) => Response,
    assert: (ctx: Ctx) => void,
    mode: OutputMode = "json",
) => {
    const folder = mkdtempSync(join(tmpdir(), "polli-gen-extra-"));
    const out: string[] = [];
    const calls: Call[] = [];
    process.chdir(folder);
    setKeyOverride("sk_test");
    // Commands read the global output mode; --json is a root-level option.
    setOutputMode(mode);
    Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: true,
    });
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        out.push(String(value));
        return true;
    });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return respond(url, init);
    });

    try {
        await command.parseAsync(argv, { from: "user" });
        // Assert before the finally block leaves the folder the command wrote to.
        assert({ out: out.join(""), calls, folder });
    } finally {
        process.chdir(originalCwd);
        rmSync(folder, { recursive: true, force: true });
    }
};

/** exitWithError exits the process; assert that instead of an exception. */
const expectExit = async (
    command: {
        parseAsync: (
            argv: string[],
            opts: { from: string },
        ) => Promise<unknown>;
    },
    argv: string[],
) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((
        code?: number,
    ) => {
        throw new Error(`exit:${code}`);
    }) as never);
    await expect(command.parseAsync(argv, { from: "user" })).rejects.toThrow(
        /exit:1/,
    );
    exit.mockRestore();
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
    process.chdir(originalCwd);
});

describe("gen embeddings", () => {
    it("prints one JSON array per input, one per line", async () => {
        await run(
            createEmbeddingsCommand(),
            ["first text", "second text"],
            () =>
                new Response(
                    JSON.stringify({
                        data: [
                            { index: 1, embedding: [3, 4] },
                            { index: 0, embedding: [1, 2] },
                        ],
                        usage: { prompt_tokens: 4 },
                    }),
                ),
            ({ out, calls }) => {
                // Sorted by index, so output order matches input order.
                expect(out.trim().split("\n")).toEqual(["[1,2]", "[3,4]"]);
                expect(calls[0].url).toContain("/v1/embeddings");
                expect(JSON.parse(String(calls[0].init.body))).toEqual({
                    input: ["first text", "second text"],
                });
            },
            "human",
        );
    });

    it("passes the model and retrieval hints through", async () => {
        await run(
            createEmbeddingsCommand(),
            [
                "q",
                "--model",
                "m",
                "--dimensions",
                "256",
                "--task-type",
                "RETRIEVAL_QUERY",
                "--input-type",
                "search_query",
            ],
            () =>
                new Response(
                    JSON.stringify({ data: [{ index: 0, embedding: [1] }] }),
                ),
            ({ calls }) => {
                expect(JSON.parse(String(calls[0].init.body))).toEqual({
                    input: ["q"],
                    model: "m",
                    dimensions: 256,
                    task_type: "RETRIEVAL_QUERY",
                    input_type: "search_query",
                });
            },
        );
    });

    it("--json prints the whole response including usage", async () => {
        await run(
            createEmbeddingsCommand(),
            ["a"],
            () =>
                new Response(
                    JSON.stringify({
                        data: [{ index: 0, embedding: [1] }],
                        usage: { total_tokens: 1 },
                    }),
                ),
            ({ out }) => {
                expect(JSON.parse(out).usage).toEqual({ total_tokens: 1 });
            },
        );
    });

    it("exits with an error when nothing is given", async () => {
        await expectExit(createEmbeddingsCommand(), []);
    });
});

describe("gen 3d", () => {
    it("saves the mesh and names the file from the returned content type", async () => {
        await run(
            create3dCommand(),
            ["a red fox"],
            () =>
                new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
                    headers: { "content-type": "model/gltf-binary" },
                }),
            ({ out, calls }) => {
                expect(JSON.parse(out).path).toBe("model.glb");
                expect([...readFileSync("model.glb")]).toEqual([
                    0x67, 0x6c, 0x54, 0x46,
                ]);
                expect(calls[0].url).toContain("/3d/");
            },
        );
    });

    it("uses .ply for the asset-harvester model", async () => {
        await run(
            create3dCommand(),
            ["a fox", "--model", "nvidia/asset-harvester"],
            () => new Response(new Uint8Array([1]), { headers: {} }),
            ({ out }) => {
                expect(JSON.parse(out).path).toBe("model.ply");
            },
        );
    });

    it("passes reference image URLs and resolution", async () => {
        await run(
            create3dCommand(),
            [
                "a fox",
                "--image",
                "https://example.com/a.png",
                "--resolution",
                "high",
            ],
            () => new Response(new Uint8Array([1]), { headers: {} }),
            ({ calls }) => {
                expect(calls[0].url).toContain(
                    "image=https%3A%2F%2Fexample.com%2Fa.png",
                );
                expect(calls[0].url).toContain("resolution=high");
            },
        );
    });

    it("exits rather than sending a local path as --image", async () => {
        await expectExit(create3dCommand(), [
            "a fox",
            "--image",
            "./local.png",
        ]);
    });
});

describe("gen voice-change and isolate", () => {
    const withSource = (name: string, argv: (source: string) => string[]) => {
        const folder = mkdtempSync(join(tmpdir(), "polli-voice-src-"));
        const source = join(folder, name);
        writeFileSync(source, new Uint8Array([9, 9]));
        return { folder, argv: argv(source) };
    };

    it("uploads the file and names the output from the response format", async () => {
        const { folder, argv } = withSource("talk.mp3", (source) => [
            source,
            "--voice",
            "nova",
        ]);
        try {
            await run(
                createVoiceChangeCommand(),
                argv,
                () =>
                    new Response(new Uint8Array([5, 5]), {
                        headers: { "content-type": "audio/opus" },
                    }),
                ({ out, calls }) => {
                    expect(JSON.parse(out).path).toBe("voice-change.opus");
                    expect(calls[0].url).toContain("/v1/audio/voice-changer");
                    expect((calls[0].init.body as FormData).get("voice")).toBe(
                        "nova",
                    );
                },
            );
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("isolate posts to the isolator endpoint", async () => {
        const { folder, argv } = withSource("interview.mp4", (source) => [
            source,
        ]);
        try {
            await run(
                createIsolateCommand(),
                argv,
                () =>
                    new Response(new Uint8Array([1]), {
                        headers: { "content-type": "audio/mpeg" },
                    }),
                ({ calls }) => {
                    expect(calls[0].url).toContain("/v1/audio/voice-isolator");
                },
            );
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });
});
