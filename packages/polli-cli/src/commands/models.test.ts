import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api.js";
import { ExitSignal, setOutputMode } from "../lib/output.js";
import {
    buildRow,
    capabilities,
    classifyType,
    createModelsCommand,
    type ModelEntry,
} from "./models.js";
import * as stats from "./stats.js";

const sampleModels: ModelEntry[] = [
    {
        name: "openai/gpt-5-nano",
        title: "GPT-5 Nano",
        category: "text",
        publisher: "OpenAI",
        description: "Fast text model",
        community: false,
        output_modalities: ["text"],
        input_modalities: ["text"],
    },
    {
        name: "deepseek/deepseek-r1",
        title: "DeepSeek R1",
        category: "decision",
        publisher: "DeepSeek",
        description: "Reasoning model",
        community: false,
        output_modalities: ["text"],
    },
    {
        name: "black-forest-labs/flux.1-schnell",
        title: "FLUX.1 Schnell",
        category: "image",
        publisher: "Black Forest Labs",
        description: "Fast image generator",
        community: false,
        output_modalities: ["image"],
    },
    {
        name: "openai/tts-1",
        title: "OpenAI TTS 1",
        category: "audio",
        publisher: "OpenAI",
        description: "Speech synthesis",
        community: false,
        output_modalities: ["audio"],
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    },
    {
        name: "user123/my-model",
        title: "Community Model",
        category: "text",
        publisher: "user123",
        description: "Custom community text model",
        community: true,
        output_modalities: ["text"],
    },
];

afterEach(() => {
    vi.restoreAllMocks();
    setOutputMode("human");
});

describe("classifyType", () => {
    it("correctly identifies modalities and categories", () => {
        expect(classifyType({ name: "m1", category: "decision" })).toBe(
            "decision",
        );
        expect(classifyType({ name: "m2", category: "realtime" })).toBe(
            "realtime",
        );
        expect(classifyType({ name: "m3", output_modalities: ["3d"] })).toBe(
            "3d",
        );
        expect(classifyType({ name: "m4", output_modalities: ["video"] })).toBe(
            "video",
        );
        expect(
            classifyType({ name: "m5", output_modalities: ["embedding"] }),
        ).toBe("embedding");
        expect(classifyType({ name: "m6", output_modalities: ["audio"] })).toBe(
            "audio",
        );
        expect(classifyType({ name: "m7", output_modalities: ["image"] })).toBe(
            "image",
        );
        expect(classifyType({ name: "m8", output_modalities: ["text"] })).toBe(
            "text",
        );
        expect(classifyType({ name: "m9" })).toBe("unknown");
    });
});

describe("capabilities and buildRow", () => {
    it("includes community tag when model is a community endpoint", () => {
        const commCaps = capabilities({ name: "comm", community: true });
        expect(commCaps).toContain("community");

        const offCaps = capabilities({ name: "off", community: false });
        expect(offCaps).not.toContain("community");
    });

    it("builds clean rows with publisher in verbose mode and omits dead pricing otherwise", () => {
        const standard = buildRow(sampleModels[0], "text", false);
        expect(standard.name).toBeDefined();
        expect(standard.type).toBe("text");
        expect(standard.pricing).toBeUndefined();
        expect(standard.publisher).toBeUndefined();

        const verbose = buildRow(sampleModels[0], "text", true);
        expect(verbose.publisher).toBe("OpenAI");
        expect(verbose.pricing).toBe("-");
    });
});

describe("modelsCommand validation", () => {
    it("fails on invalid type", async () => {
        await expect(
            createModelsCommand().parseAsync(["--type", "invalid-type"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails when both --official and --community are provided", async () => {
        await expect(
            createModelsCommand().parseAsync(["--official", "--community"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails on conflicting source options", async () => {
        await expect(
            createModelsCommand().parseAsync(
                ["--official", "--source", "community"],
                { from: "user" },
            ),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails on invalid source option", async () => {
        await expect(
            createModelsCommand().parseAsync(["--source", "invalid-source"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails on invalid reliability option", async () => {
        await expect(
            createModelsCommand().parseAsync(["--reliability", "invalid-rel"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails on conflicting positional query and --search", async () => {
        await expect(
            createModelsCommand().parseAsync(
                ["pos-query", "--search", "flag-query"],
                {
                    from: "user",
                },
            ),
        ).rejects.toThrow(ExitSignal);
    });

    it("fails on invalid stats window before network fetch", async () => {
        const fetchSpy = vi.spyOn(stats, "fetchModelStats");
        await expect(
            createModelsCommand().parseAsync(["--stats", "--window", "0"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fails when --stats is combined with source or reliability filters", async () => {
        await expect(
            createModelsCommand().parseAsync(["--stats", "--official"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);

        await expect(
            createModelsCommand().parseAsync(["--stats", "--all"], {
                from: "user",
            }),
        ).rejects.toThrow(ExitSignal);
    });
});

describe("modelsCommand querying", () => {
    it("sends a bare /models request by default", async () => {
        setOutputMode("json");
        vi.spyOn(process.stdout, "write").mockReturnValue(true);
        const spy = vi
            .spyOn(api, "gen")
            .mockResolvedValue(sampleModels as never);

        await createModelsCommand().parseAsync([], { from: "user" });

        expect(spy).toHaveBeenCalledWith("/models");
    });

    it("queries /models endpoint with correct source and reliability parameters", async () => {
        let calledPath = "";
        vi.spyOn(process.stdout, "write").mockReturnValue(true);
        vi.spyOn(api, "gen").mockImplementation(async (path: string) => {
            calledPath = path;
            return sampleModels as never;
        });

        await createModelsCommand().parseAsync(["--official", "--all", "gpt"], {
            from: "user",
        });

        expect(calledPath).toContain("/models?");
        expect(calledPath).toContain("source=official");
        expect(calledPath).toContain("reliability=all");
        expect(calledPath).toContain("query=gpt");
    });

    it("passes --community and --search flags to API query", async () => {
        let calledPath = "";
        vi.spyOn(process.stdout, "write").mockReturnValue(true);
        vi.spyOn(api, "gen").mockImplementation(async (path: string) => {
            calledPath = path;
            return sampleModels as never;
        });

        await createModelsCommand().parseAsync(
            ["--community", "--search", "flux"],
            { from: "user" },
        );

        expect(calledPath).toContain("source=community");
        expect(calledPath).toContain("query=flux");
    });

    it("filters models by type client-side in JSON output mode", async () => {
        setOutputMode("json");
        const written: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((str) => {
            written.push(String(str));
            return true;
        });
        vi.spyOn(api, "gen").mockResolvedValue(sampleModels as never);

        await createModelsCommand().parseAsync(["--type", "image"], {
            from: "user",
        });

        const parsed = JSON.parse(written.join(""));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe("black-forest-labs/flux.1-schnell");
        expect(parsed[0].type).toBe("image");
    });

    it("lists models with voices when --voices is specified", async () => {
        setOutputMode("json");
        const written: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((str) => {
            written.push(String(str));
            return true;
        });
        vi.spyOn(api, "gen").mockResolvedValue(sampleModels as never);

        await createModelsCommand().parseAsync(["--voices"], { from: "user" });

        const parsed = JSON.parse(written.join(""));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe("openai/tts-1");
        expect(parsed[0].voices).toContain("alloy");
    });

    it("filters stats by query when --stats is used with search text", async () => {
        setOutputMode("json");
        const written: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((str) => {
            written.push(String(str));
            return true;
        });
        vi.spyOn(stats, "fetchModelStats").mockResolvedValue([
            {
                model: "openai/gpt-5-nano",
                total_requests: 100,
                errors_5xx: 0,
                avg_latency_ms: 1200,
                event_type: "generate.text",
            },
            {
                model: "black-forest-labs/flux.1-schnell",
                total_requests: 50,
                errors_5xx: 0,
                avg_latency_ms: 2500,
                event_type: "generate.image",
            },
        ] as never);

        await createModelsCommand().parseAsync(["--stats", "nano"], {
            from: "user",
        });

        const parsed = JSON.parse(written.join(""));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].model).toBe("openai/gpt-5-nano");
    });
});
