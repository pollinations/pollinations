import { SELF } from "cloudflare:test";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    ModelInfoSchema,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import { getVisibleTextModels } from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { describe, expect, it } from "vitest";

// Models that must expose verified Chat parameter metadata. Each covers a
// different provider/capability combination: OpenAI Chat (Azure, locked
// sampling), Anthropic via Bedrock Converse (mutually-exclusive sampling
// params), Gemini via OpenRouter (tool-based web search) and Perplexity
// (web_search_options). Keep this list to models whose parameter behavior has
// been verified against the gateway transforms (parameterProcessor +
// per-model transforms).
const DOCUMENTED_MODELS = [
    "openai/gpt-5.4-nano",
    "anthropic/claude-sonnet-4.6",
    "google/gemini-3-flash-preview",
    "perplexity/sonar",
] as const;

function textModelInfo(name: string) {
    return modelInfoFromDefinition(name, TEXT_SERVICES[name]);
}

describe("Chat parameter registry fields", () => {
    it.each(
        DOCUMENTED_MODELS,
    )("%s exposes supported_parameters and default_parameters", (name) => {
        const info = textModelInfo(name);
        expect(info.supported_parameters?.length).toBeGreaterThan(0);
        expect(info.default_parameters).toBeDefined();

        const names = info.supported_parameters?.map((p) => p.name);
        expect(new Set(names).size).toBe(names.length);

        // Every advertised default must map to an advertised parameter.
        for (const key of Object.keys(info.default_parameters ?? {})) {
            expect(names).toContain(key);
        }

        // Each entry must be schema-valid (round-trip through zod).
        expect(() => ModelInfoSchema.parse(info)).not.toThrow();
    });

    it("gpt-5.4-nano omits parameters the gateway strips", () => {
        const info = textModelInfo("openai/gpt-5.4-nano");
        const names = info.supported_parameters?.map((p) => p.name);
        // parameterProcessor strips these for /^gpt-5/ models — listing them
        // would describe controls that are silently ignored.
        expect(names).not.toContain("top_p");
        expect(names).not.toContain("frequency_penalty");
        expect(names).not.toContain("presence_penalty");
        // Sampling is locked: temperature is supported but fixed at 1.
        expect(info.default_parameters).toEqual(
            expect.objectContaining({ temperature: 1, stream: false }),
        );
    });

    it("claude-sonnet-4.6 documents the temperature/top_p mutual exclusion", () => {
        const info = textModelInfo("anthropic/claude-sonnet-4.6");
        const topP = info.supported_parameters?.find((p) => p.name === "top_p");
        expect(topP?.condition).toContain("temperature");
        const temperature = info.supported_parameters?.find(
            (p) => p.name === "temperature",
        );
        expect(temperature?.condition).toContain("thinking");
        expect(info.default_parameters).toEqual(
            expect.objectContaining({ temperature: 1 }),
        );
    });

    it("gemini-3-flash-preview exposes tool-based web search", () => {
        const info = textModelInfo("google/gemini-3-flash-preview");
        const tools = info.supported_parameters?.find(
            (p) => p.name === "tools",
        );
        expect(tools?.description).toContain("google_search");
        const effort = info.supported_parameters?.find(
            (p) => p.name === "reasoning_effort",
        );
        expect(effort?.enum).toContain("none");
    });

    it("sonar exposes web_search_options with its search_context_size contract", () => {
        const info = textModelInfo("perplexity/sonar");
        const search = info.supported_parameters?.find(
            (p) => p.name === "web_search_options",
        );
        expect(search?.condition).toContain("low");
        expect(search?.condition).toContain("high");
        expect(info.default_parameters).toEqual(
            expect.objectContaining({ temperature: 0.2 }),
        );
    });

    it("models without verified parameter metadata omit both fields", () => {
        // Text models without verified parameter data must omit both fields.
        const noMetadata = getVisibleTextModels().filter(
            (name) => !TEXT_SERVICES[name]?.supportedParameters,
        );
        expect(noMetadata.length).toBeGreaterThan(0);
        const bare = textModelInfo(noMetadata[0]);
        expect(bare.supported_parameters).toBeUndefined();
        expect(bare.default_parameters).toBeUndefined();

        // Non-text categories never carry Chat parameters.
        const imageKeys = Object.keys(IMAGE_SERVICES);
        expect(imageKeys.length).toBeGreaterThan(0);
        const imageKey = imageKeys[0];
        const imageInfo = modelInfoFromDefinition(
            imageKey,
            IMAGE_SERVICES[imageKey],
        );
        expect(imageInfo.supported_parameters).toBeUndefined();
        expect(imageInfo.default_parameters).toBeUndefined();
    });

    it("every visible text model passes the schema when metadata is present", () => {
        for (const name of getVisibleTextModels()) {
            const info = textModelInfo(name);
            if (info.supported_parameters || info.default_parameters) {
                expect(() => ModelInfoSchema.parse(info)).not.toThrow();
            }
        }
    });
});

describe("Chat parameter endpoint exposure", () => {
    async function fetchWorker(path: string, init: RequestInit = {}) {
        return SELF.fetch(
            new Request(`https://gen.pollinations.ai${path}`, init),
        );
    }

    it("GET /v1/models/:model exposes supported_parameters and default_parameters", async () => {
        const response = await fetchWorker("/v1/models/gpt-5.4-nano");
        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body.supported_parameters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "temperature" }),
                expect.objectContaining({ name: "max_completion_tokens" }),
            ]),
        );
        expect(body.default_parameters).toEqual(
            expect.objectContaining({ temperature: 1 }),
        );
    });

    it("GET /text/models includes the new fields for documented models", async () => {
        const response = await fetchWorker("/text/models");
        expect(response.status).toBe(200);
        const list = (await response.json()) as {
            name: string;
            supported_parameters?: unknown[];
            default_parameters?: Record<string, unknown>;
        }[];
        const nano = list.find((m) => m.name === "openai/gpt-5.4-nano");
        expect(nano?.supported_parameters?.length).toBeGreaterThan(0);
        expect(nano?.default_parameters?.temperature).toBe(1);

        const sonar = list.find((m) => m.name === "perplexity/sonar");
        expect(sonar?.supported_parameters?.length).toBeGreaterThan(0);
    });

    it("list and retrieve stay consistent for the new fields", async () => {
        const listResponse = await fetchWorker("/v1/models");
        const list = (await listResponse.json()) as {
            data: Record<string, unknown>[];
        };
        const listed = list.data.find((m) => m.id === "openai/gpt-5.4-nano");
        expect(listed).toBeDefined();

        const retrieveResponse = await fetchWorker("/v1/models/gpt-5.4-nano");
        const retrieved = (await retrieveResponse.json()) as Record<
            string,
            unknown
        >;
        expect(retrieved.supported_parameters).toEqual(
            listed?.supported_parameters,
        );
        expect(retrieved.default_parameters).toEqual(
            listed?.default_parameters,
        );
    });
});
