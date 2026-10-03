import { describe, expect, it } from "vitest";
import {
    buildPiConfigFiles,
    type CatalogModel,
    filterAgentModels,
    PI_HOME,
} from "./piConfig";

const catalog: CatalogModel[] = [
    {
        id: "openai/gpt-6-sol",
        tools: true,
        output_modalities: ["text"],
        input_modalities: ["text", "image"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 400000,
    },
    {
        id: "no-tools/model",
        tools: false,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 8000,
    },
    {
        id: "community/model",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 8000,
        community: true,
    },
    {
        id: "published-agent/model",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 8000,
        agent: { id: "some-agent" },
    },
    {
        id: "image-only/model",
        tools: true,
        output_modalities: ["image"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 8000,
    },
];

describe("filterAgentModels", () => {
    it("keeps only first-party tool-calling chat models", () => {
        const models = filterAgentModels(catalog);
        expect(models.map((m) => m.id)).toEqual(["openai/gpt-6-sol"]);
        expect(models[0]).toEqual({
            id: "openai/gpt-6-sol",
            contextWindow: 400000,
            input: ["text", "image"],
        });
    });
});

describe("buildPiConfigFiles", () => {
    it("writes Pi's provider config under its pinned home directory", () => {
        const models = filterAgentModels(catalog);
        const files = buildPiConfigFiles("pk_test", "openai/gpt-6-sol", models);

        const paths = Object.keys(files);
        expect(paths).toEqual([
            `${PI_HOME}/.pi/agent/models.json`,
            `${PI_HOME}/.pi/agent/auth.json`,
            `${PI_HOME}/.pi/agent/settings.json`,
        ]);

        const modelsJson = JSON.parse(
            files[`${PI_HOME}/.pi/agent/models.json`],
        );
        expect(modelsJson.providers.pollinations.baseUrl).toBe(
            "https://gen.pollinations.ai/v1",
        );
        expect(modelsJson.providers.pollinations.api).toBe(
            "openai-completions",
        );
        expect(modelsJson.providers.pollinations.models).toEqual([
            {
                id: "openai/gpt-6-sol",
                name: "openai/gpt-6-sol",
                contextWindow: 400000,
                input: ["text", "image"],
            },
        ]);

        const authJson = JSON.parse(files[`${PI_HOME}/.pi/agent/auth.json`]);
        expect(authJson.pollinations).toEqual({
            type: "api_key",
            key: "pk_test",
        });

        const settingsJson = JSON.parse(
            files[`${PI_HOME}/.pi/agent/settings.json`],
        );
        expect(settingsJson).toEqual({
            defaultProvider: "pollinations",
            defaultModel: "openai/gpt-6-sol",
        });
    });
});
