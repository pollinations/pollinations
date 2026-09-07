import { resolveProviderId } from "@shared/providers.ts";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import { availableModels } from "../src/text/availableModels.ts";

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
    it.each(
        availableModels.map((model) => [model.name, model] as const),
    )("%s attributes cost to its configured API supplier", (name, model) => {
        const vendor = resolveProviderId(
            getRegistryModelDefinition(resolveModelName(name)).provider,
        );
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
