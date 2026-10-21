import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageCommand } from "../commands/gen/image.js";
import { createVideoCommand } from "../commands/gen/video.js";
import { estimateMediaCost, type MediaModel } from "./estimate.js";
import { setOutputMode } from "./output.js";

const image = (width = 1024, height = 1024, references = 0) => ({
    kind: "image" as const,
    width,
    height,
    references,
});
const video = (duration?: number, audio = false, references = 0) => ({
    kind: "video" as const,
    width: 1024,
    height: 1024,
    references,
    duration,
    audio,
});

describe("estimateMediaCost", () => {
    it("prices a flat-rate image per image", () => {
        const model: MediaModel = {
            name: "flux",
            flat_rate: true,
            pricing: { currency: "pollen", completionImageTokens: "0.002" },
        };
        expect(estimateMediaCost(model, image()).total).toBe(0.002);
    });

    it("prices megapixel models by the requested size and reference images", () => {
        const model: MediaModel = {
            name: "flux-2-pro",
            flat_rate: true,
            pricing: {
                currency: "pollen",
                promptImageTokens: "0.01",
                completionImageTokens: "0.01",
            },
            pricing_units: {
                promptImageTokens: { unit: "megapixel" },
                completionImageTokens: { unit: "megapixel" },
            },
        };
        const out = estimateMediaCost(model, image(2000, 1000));
        expect(out.total).toBeCloseTo(0.02);
        // Reference-image megapixels are unknown until the provider reads them.
        const edit = estimateMediaCost(model, image(1000, 1000, 1));
        expect(edit.total).toBeNull();
        expect(edit.unpriced).toEqual(["promptImageTokens"]);
    });

    it("applies the declared quantity of a megapixel rate", () => {
        const model: MediaModel = {
            name: "qwen-image-2.1",
            flat_rate: true,
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.00000002",
            },
            pricing_units: {
                completionImageTokens: { unit: "megapixel", quantity: 1e6 },
            },
        };
        expect(estimateMediaCost(model, image()).total).toBeCloseTo(
            0.02 * 1.048576,
        );
    });

    it("adds per-image reference rates only when references are sent", () => {
        const model: MediaModel = {
            name: "grok-imagine-image",
            flat_rate: true,
            pricing: {
                currency: "pollen",
                promptImageTokens: "0.002",
                completionImageTokens: "0.02",
            },
        };
        expect(estimateMediaCost(model, image()).total).toBeCloseTo(0.02);
        expect(
            estimateMediaCost(model, image(1024, 1024, 2)).total,
        ).toBeCloseTo(0.024);
    });

    it("reports no total for token-billed models", () => {
        const model: MediaModel = {
            name: "gpt-image-2",
            flat_rate: false,
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.00000375",
                completionImageTokens: "0.0000225",
            },
        };
        const out = estimateMediaCost(model, image());
        expect(out.total).toBeNull();
        expect(out.unpriced).toEqual([
            "promptTextTokens",
            "completionImageTokens",
        ]);
    });

    it("prices video seconds with the model's default duration", () => {
        const model: MediaModel = {
            name: "veo",
            default_duration: 4,
            pricing: {
                currency: "pollen",
                completionVideoSeconds: "0.08",
                completionAudioSeconds: "0.02",
            },
        };
        expect(estimateMediaCost(model, video()).total).toBeCloseTo(0.32);
        expect(estimateMediaCost(model, video(8, true)).total).toBeCloseTo(0.8);
    });

    it("has no total when the model lists no price", () => {
        const out = estimateMediaCost(
            { name: "minimax-h3-max", pricing: { currency: "pollen" } },
            video(5),
        );
        expect(out.total).toBeNull();
    });
});

describe("--estimate", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setOutputMode("human");
    });

    const models: MediaModel[] = [
        {
            name: "tongyi-mai/z-image-turbo",
            aliases: ["zimage"],
            flat_rate: true,
            pricing: { currency: "pollen", completionImageTokens: "0.004" },
        },
        {
            name: "google/veo-3.1-fast",
            aliases: ["veo"],
            default_duration: 4,
            pricing: { currency: "pollen", completionVideoSeconds: "0.08" },
        },
    ];

    const run = async (
        command: ReturnType<typeof createImageCommand>,
        args: string[],
    ) => {
        const urls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                urls.push(String(url));
                return new Response(JSON.stringify(models), { status: 200 });
            }),
        );
        const out: string[] = [];
        vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
            out.push(String(chunk));
            return true;
        });
        setOutputMode("json");
        await command.parseAsync(args, { from: "user" });
        return { urls, result: JSON.parse(out.join("")) };
    };

    it("only reads the model list for gen image", async () => {
        const { urls, result } = await run(createImageCommand(), [
            "a cat",
            "--estimate",
        ]);
        expect(urls.map((u) => new URL(u).pathname)).toEqual(["/image/models"]);
        expect(result.model).toBe("tongyi-mai/z-image-turbo");
        expect(result.pollen).toBe(0.004);
    });

    it("uses the API default video model and the requested duration", async () => {
        const { urls, result } = await run(createVideoCommand(), [
            "a waterfall",
            "--duration",
            "6",
            "--estimate",
        ]);
        expect(urls.map((u) => new URL(u).pathname)).toEqual(["/image/models"]);
        expect(result.model).toBe("google/veo-3.1-fast");
        expect(result.pollen).toBeCloseTo(0.48);
    });
});
