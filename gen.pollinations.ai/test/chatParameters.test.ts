import { SELF } from "cloudflare:test";
import {
    getAudioModelsInfo,
    getImageModelsInfo,
    ModelInfoSchema,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("modelInfoFromDefinition round-trips supported/default parameters", () => {
    const definition = getRegistryModelDefinition("openai/gpt-5.4-nano");
    expect(definition.supportedParameters?.length).toBeGreaterThan(0);

    const info = modelInfoFromDefinition("openai/gpt-5.4-nano", definition);
    // Round-trips through the schema unmodified.
    const parsed = ModelInfoSchema.parse(info);
    expect(parsed.supported_parameters).toEqual(definition.supportedParameters);
    expect(parsed.default_parameters).toEqual(definition.defaultParameters);
});

test("supported/default parameters are omitted when a text model sets none", () => {
    // A text model with no declared parameters must not expose the fields.
    const info = modelInfoFromDefinition(
        "perplexity/sonar",
        getRegistryModelDefinition("perplexity/sonar"),
    );
    expect(info.supported_parameters).toBeUndefined();
    expect(info.default_parameters).toBeUndefined();
});

test("non-text model listings never include supported/default parameters", () => {
    // Even if a non-text definition hypothetically set these, model-info
    // must not surface them (Chat-completion params don't apply there).
    for (const info of getImageModelsInfo()) {
        expect(info.supported_parameters).toBeUndefined();
        expect(info.default_parameters).toBeUndefined();
    }
    for (const info of getAudioModelsInfo()) {
        expect(info.supported_parameters).toBeUndefined();
        expect(info.default_parameters).toBeUndefined();
    }
});

test("openai/gpt-5.4-nano exposes declared parameters and omits stripped sampling", async () => {
    const response = await fetchWorker("/v1/models/openai");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        supported_parameters?: Array<{ name: string }>;
        default_parameters?: Record<string, unknown>;
    };
    expect(Array.isArray(body.supported_parameters)).toBe(true);
    const names = (body.supported_parameters ?? []).map((p) => p.name);

    // Parameters that actually survive the transform pipeline.
    expect(names).toEqual(
        expect.arrayContaining([
            "max_completion_tokens",
            "reasoning_effort",
            "stream",
            "tools",
            "response_format",
        ]),
    );
    // Regression guard against PR #14623: temperature and the other sampling
    // controls are stripped by omitOpenAISampling, not "supported" or "locked
    // to 1" — they must never appear.
    for (const stripped of [
        "temperature",
        "top_p",
        "top_k",
        "frequency_penalty",
        "presence_penalty",
        "repetition_penalty",
        "seed",
    ]) {
        expect(names).not.toContain(stripped);
    }
});

test("claude-sonnet-5 exposes its default max_tokens and omits stripped sampling", () => {
    // claude-sonnet-5 is paid-only, so exercise the registry-derived info
    // directly instead of a live (possibly 404) request.
    const definition = getRegistryModelDefinition("anthropic/claude-sonnet-5");
    const info = modelInfoFromDefinition(
        "anthropic/claude-sonnet-5",
        definition,
    );
    const names = (info.supported_parameters ?? []).map((p) => p.name);
    expect(info.default_parameters).toEqual({ max_tokens: 64000 });
    expect(names).toContain("reasoning_effort");
    // Stripped by omitClaudeSampling.
    for (const stripped of ["temperature", "top_p", "top_k"]) {
        expect(names).not.toContain(stripped);
    }
});

test("grok-4.6 exposes supported sampling parameters", () => {
    const definition = getRegistryModelDefinition("x-ai/grok-4.6");
    const info = modelInfoFromDefinition("x-ai/grok-4.6", definition);
    const names = (info.supported_parameters ?? []).map((p) => p.name);
    // No sampling-omit transform is applied to grok-4.6, so temperature and
    // top_p pass straight through.
    expect(names).toEqual(
        expect.arrayContaining(["temperature", "top_p", "reasoning_effort"]),
    );
});
