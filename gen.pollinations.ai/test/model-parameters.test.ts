import { SELF } from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

const VERIFIED_MODELS = [
    "openai/gpt-5.4-nano",
    "openai/gpt-5.4",
    "anthropic/claude-haiku-4.5",
] as const;

test("verified chat models expose supported/default parameters on rich listings", async () => {
    for (const path of ["/models", "/text/models"]) {
        const response = await fetchWorker(path);
        expect(response.status).toBe(200);
        const models = (await response.json()) as Record<string, unknown>[];
        for (const name of VERIFIED_MODELS) {
            const model = models.find((m) => m.name === name) as
                | Record<string, unknown>
                | undefined;
            expect(model, `${name} on ${path}`).toBeDefined();
            expect(model!.supported_parameters).toEqual(expect.any(Array));
            expect(
                (model!.supported_parameters as unknown[]).length,
            ).toBeGreaterThan(0);
            expect(model!.default_parameters).toEqual(expect.any(Object));
            expect(model!.parameter_notes).toEqual(expect.any(String));
        }
    }
});

test("v1 models list and retrieve share parameter metadata (aliases consistent)", async () => {
    const listResponse = await fetchWorker("/v1/models");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
        data: Record<string, unknown>[];
    };

    const nano = list.data.find((m) => m.id === "openai/gpt-5.4-nano");
    expect(nano).toBeDefined();
    // Sampling controls are stripped by the gateway — never advertised.
    expect(nano!.supported_parameters).not.toContain("temperature");
    expect(nano!.supported_parameters).not.toContain("seed");
    expect(nano!.supported_parameters).toContain("tools");

    const reasoning = list.data.find((m) => m.id === "openai/gpt-5.4");
    expect(reasoning!.supported_parameters).toContain("reasoning_effort");

    const claude = list.data.find(
        (m) => m.id === "anthropic/claude-haiku-4.5",
    );
    expect(claude!.supported_parameters).toContain("temperature");
    expect(claude!.supported_parameters).toContain("reasoning_effort");
    expect(claude!.default_parameters).toMatchObject({
        reasoning_effort: "none",
    });

    // Retrieve matches list entry exactly (shared mapper).
    for (const name of VERIFIED_MODELS) {
        const retrieved = await fetchWorker(
            `/v1/models/${encodeURIComponent(name)}`,
        );
        expect(retrieved.status).toBe(200);
        expect(await retrieved.json()).toEqual(
            list.data.find((m) => m.id === name),
        );
    }

    // Alias resolves to the canonical entry with identical metadata.
    const aliasResponse = await fetchWorker("/v1/models/claude-haiku");
    expect(aliasResponse.status).toBe(200);
    expect(await aliasResponse.json()).toEqual(
        list.data.find((m) => m.id === "anthropic/claude-haiku-4.5"),
    );
});

test("parameter metadata describes chat only and omits unknowns", async () => {
    const response = await fetchWorker(
        `/v1/models/${encodeURIComponent("openai/gpt-5.4-nano")}`,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body.parameter_notes)).toMatch(/chat api only/i);
    expect(String(body.parameter_notes)).toMatch(/not \/v1\/responses/i);
    // No invented upstream defaults.
    expect(body.default_parameters).toEqual({});
});
