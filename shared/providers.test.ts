import { describe, expect, it } from "vitest";
import { availableModels } from "../gen.pollinations.ai/src/text/availableModels.ts";
import registry from "../operations/economics/provider-registry.json";
import { createProviderResolver } from "./providers";
import {
    getModels,
    getRegistryModelDefinition,
    resolveModelName,
} from "./registry/registry";
import { TEXT_SERVICES } from "./registry/text";

const resolveProvider = createProviderResolver(registry.providers);

describe("API provider identities", () => {
    it("keeps vendor IDs and aliases normalized and unambiguous", () => {
        const names = registry.providers.flatMap(({ id, aliases }) => [
            id,
            ...aliases,
        ]);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) {
            expect(name).not.toBe("");
            expect(name).toBe(name.trim().toLowerCase());
        }
    });

    it.each([
        [" BedRock ", "aws"],
        ["aws-bedrock", "aws"],
        ["azure-2", "azure"],
        ["vast.ai", "vast"],
        ["vastai", "vast"],
        ["openrouter", "openrouter"],
    ])("resolves %s to its reviewed vendor %s", (name, expected) => {
        expect(resolveProvider(name)?.id).toBe(expected);
    });

    it.each([
        "",
        "new-api-provider",
        "open-router",
        "aws-bedrok",
    ])("leaves the unregistered name %s unresolved", (name) =>
        expect(resolveProvider(name)?.id).toBeUndefined());

    // getModels includes every bundled modality and hidden fallback route.
    // MCP billing and arbitrary community endpoints are outside this contract.
    it.each(
        getModels(),
    )("maps model route %s to a registered vendor", (model) => {
        const { provider } = getRegistryModelDefinition(model);
        expect(provider).toBe(provider.trim().toLowerCase());
        expect(
            resolveProvider(provider)?.id,
            `${model}: register provider "${provider}" in operations/economics/provider-registry.json`,
        ).toBe(provider);
    });
});

// These are routing expectations, not another provider catalog. Compare the
// actual connection configuration with the vendor attributed by the registry.
const PROTOCOL_VENDORS: Record<string, string> = {
    "azure-openai": "azure",
    bedrock: "aws",
    "vertex-ai": "google",
    "perplexity-ai": "perplexity",
    openrouter: "openrouter",
};
const HOST_VENDORS: Record<string, string> = {
    "api.fireworks.ai": "fireworks",
    "api.deepinfra.com": "deepinfra",
    "openrouter.ai": "openrouter",
    "dashscope-intl.aliyuncs.com": "alibaba",
    "ai-gateway.vercel.sh": "vercel",
    "qwen-3-coder-30b-a3b-instruct.endpoints.kepler.ai.cloud.ovh.net":
        "ovhcloud",
    "oai.endpoints.kepler.ai.cloud.ovh.net": "ovhcloud",
};

describe("text API provider attribution", () => {
    it("configures every registered text route, including hidden fallbacks, exactly once", () => {
        expect(availableModels.map((model) => model.name).sort()).toEqual(
            Object.keys(TEXT_SERVICES).sort(),
        );
    });

    it.each(
        availableModels.map((model) => [model.name, model] as const),
    )("%s attributes cost to its configured API supplier", (name, model) => {
        const vendor = resolveProvider(
            getRegistryModelDefinition(resolveModelName(name)).provider,
        )?.id;
        expect(vendor).toBeDefined();
        const config = model.config();
        const protocol = String(config.provider);
        const endpoints = [
            config.directEndpoint,
            config["custom-host"],
            config.responsesEndpoint,
        ].filter((value): value is string => typeof value === "string");

        // "openai" is a wire protocol for several unrelated suppliers.
        // OpenRouter's nested provider.only selects its own upstream; we
        // still buy that request from OpenRouter, not that nested provider.
        if (protocol !== "openai") {
            expect(PROTOCOL_VENDORS[protocol], protocol).toBeDefined();
            expect(vendor).toBe(PROTOCOL_VENDORS[protocol]);
        } else {
            expect(endpoints.length).toBeGreaterThan(0);
        }
        for (const endpoint of endpoints) {
            const host = new URL(endpoint).hostname;
            const expectedVendor = host.endsWith(".azure.com")
                ? "azure"
                : HOST_VENDORS[host];
            expect(
                expectedVendor,
                `Unreviewed API host: ${host}`,
            ).toBeDefined();
            expect(vendor, `${name} connects to ${host}`).toBe(expectedVendor);
        }
    });
});
