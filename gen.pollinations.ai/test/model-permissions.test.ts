import { SELF } from "cloudflare:test";
import {
    getAudioModelsInfo,
    getEmbeddingModelsInfo,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import {
    getAudioModels,
    getEmbeddingModels,
    getImageModels,
    getModelDefinition,
    getTextModels,
    getVisibleAudioModels,
    getVisibleEmbeddingModels,
    getVisibleImageModels,
    getVisibleTextModels,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("filters OpenAI-compatible model list by API key permissions", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker("/v1/models", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        data: { id: string }[];
    };
    const modelIds = body.data.map((model) => model.id);

    expect(modelIds).toContain("openai-fast");
    expect(modelIds).not.toContain("openai");
    expect(modelIds).not.toContain("mistral");
});

test("filters image model list by API key permissions", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker("/image/models", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string }[];
    const modelNames = body.map((model) => model.name);

    expect(modelNames).toContain("flux");
    expect(modelNames).not.toContain("turbo");
});

test("filters paid-only audio models by paid balance", async ({
    apiKey,
    paidApiKey,
}) => {
    const freeResponse = await fetchWorker("/audio/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    const paidResponse = await fetchWorker("/audio/models", {
        headers: { Authorization: `Bearer ${paidApiKey}` },
    });

    expect(freeResponse.status).toBe(200);
    expect(paidResponse.status).toBe(200);

    const freeModelNames = (
        (await freeResponse.json()) as { name: string }[]
    ).map((model) => model.name);
    const paidModelNames = (
        (await paidResponse.json()) as { name: string }[]
    ).map((model) => model.name);

    expect(freeModelNames).toContain("universal-2");
    expect(freeModelNames).not.toContain("scribe");
    expect(paidModelNames).toContain("scribe");
});

// Registry-level invariant behind "unlisted" community models: `hidden: true`
// must drop a model from every listing surface while leaving it fully
// resolvable/callable by id or alias. No model is hidden today, so this
// mostly proves the non-hidden branch now and guards the hidden branch the
// moment a model sets the flag.
test("hidden models are excluded from visible/info lists but still resolve by id", () => {
    const groups = [
        {
            all: getTextModels(),
            visible: getVisibleTextModels(),
            info: getTextModelsInfo(),
        },
        {
            all: getImageModels(),
            visible: getVisibleImageModels(),
            info: getImageModelsInfo(),
        },
        {
            all: getAudioModels(),
            visible: getVisibleAudioModels(),
            info: getAudioModelsInfo(),
        },
        {
            all: getEmbeddingModels(),
            visible: getVisibleEmbeddingModels(),
            info: getEmbeddingModelsInfo(),
        },
    ];

    for (const { all, visible, info } of groups) {
        const visibleIds = new Set<string>(visible);
        const infoNames = new Set(info.map((m) => m.name));

        for (const id of all) {
            const isHidden = !!getModelDefinition(id).hidden;
            expect(visibleIds.has(id)).toBe(!isHidden);
            expect(infoNames.has(id)).toBe(!isHidden);
            // Hidden or not, the model must still resolve by its own canonical id.
            expect(resolveModelName(id)).toBe(id);
        }
    }
});
