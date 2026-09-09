import { SELF } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

type ModelBody = {
    id?: string;
    name?: string;
    supported_parameters?: string[];
    default_parameters?: Record<string, unknown>;
};

test("verified models expose chat parameter support on /models", async () => {
    const response = await fetchWorker("/models");
    expect(response.status).toBe(200);
    const models = (await response.json()) as ModelBody[];

    const gpt54 = models.find((m) => m.name === "openai/gpt-5.4");
    expect(gpt54?.supported_parameters).toContain("max_completion_tokens");
    // Sampling controls are silently dropped by the route's transform.
    expect(gpt54?.supported_parameters).not.toContain("temperature");
    expect(gpt54?.supported_parameters).not.toContain("top_p");
    expect(gpt54?.supported_parameters).not.toContain("seed");
    expect(gpt54?.default_parameters).toMatchObject({
        stream: false,
        parallel_tool_calls: true,
    });

    const oss = models.find((m) => m.name === "openai/gpt-oss-20b");
    expect(oss?.supported_parameters).toEqual(
        expect.arrayContaining([
            "temperature",
            "top_p",
            "seed",
            "reasoning_effort",
        ]),
    );
    // gpt-oss model-card documented sampling defaults.
    expect(oss?.default_parameters).toMatchObject({
        temperature: 1,
        top_p: 1,
    });

    const claude = models.find((m) => m.name === "anthropic/claude-sonnet-4.6");
    expect(claude?.supported_parameters).toEqual(
        expect.arrayContaining(["temperature", "top_p", "reasoning_effort"]),
    );
    // Controls without a Bedrock Converse equivalent stay unlisted.
    expect(claude?.supported_parameters).not.toContain("seed");
    expect(claude?.supported_parameters).not.toContain("frequency_penalty");
});

test("/text/models carries the same parameter metadata", async () => {
    const response = await fetchWorker("/text/models");
    expect(response.status).toBe(200);
    const models = (await response.json()) as ModelBody[];
    const gpt54 = models.find((m) => m.name === "openai/gpt-5.4");
    expect(gpt54?.supported_parameters).toContain("reasoning_effort");
    const oss = models.find((m) => m.name === "openai/gpt-oss-20b");
    expect(oss?.supported_parameters).toContain("temperature");
});

test("/v1/models and alias lookup share identical parameter metadata", async () => {
    const listed = await fetchWorker("/v1/models");
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as { data: ModelBody[] };
    const listedEntry = list.data.find((m) => m.id === "openai/gpt-5.4");
    expect(listedEntry?.supported_parameters).toContain("reasoning_effort");
    expect(listedEntry?.supported_parameters).not.toContain("temperature");

    const viaAlias = await fetchWorker("/v1/models/gpt-5.4");
    expect(viaAlias.status).toBe(200);
    const aliasBody = (await viaAlias.json()) as ModelBody;
    expect(aliasBody.id).toBe("openai/gpt-5.4");
    expect(aliasBody.supported_parameters).toEqual(
        listedEntry?.supported_parameters,
    );
    expect(aliasBody.default_parameters).toEqual(
        listedEntry?.default_parameters,
    );
});

test("models without verified support omit the fields entirely", async () => {
    const response = await fetchWorker("/text/models");
    expect(response.status).toBe(200);
    const models = (await response.json()) as ModelBody[];
    const unverified = models.find((m) => m.name === "qwen/qwen3.8-max");
    expect(unverified).toBeDefined();
    expect(unverified?.supported_parameters).toBeUndefined();
    expect(unverified?.default_parameters).toBeUndefined();
});
