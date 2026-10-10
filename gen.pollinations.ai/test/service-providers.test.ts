import {
    getModels,
    getRegistryModelDefinition,
} from "@shared/registry/registry.ts";
import { expect, it } from "vitest";
import SERVICE_PROVIDERS_PAGE from "../../pollinations.ai/public/legal/SUBPROCESSORS.md?raw";

// Registry `provider` ids as named on the public Service Providers page.
const PROVIDER_NAMES: Record<string, string> = {
    alibaba: "Alibaba Cloud",
    assemblyai: "AssemblyAI",
    aws: "Amazon Bedrock",
    azure: "Microsoft Azure",
    deepinfra: "DeepInfra",
    elevenlabs: "ElevenLabs",
    fal: "fal.ai",
    fireworks: "Fireworks AI",
    google: "Google",
    inferenceport: "InferencePort",
    mistral: "Mistral AI",
    novita: "Novita AI",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    ovhcloud: "OVHcloud",
    perplexity: "Perplexity",
    replicate: "Replicate",
    stability: "Stability AI",
    vast: "Vast.ai",
    vercel: "Vercel AI Gateway",
    xai: "xAI",
};

it("lists exactly the registry's model providers on the Service Providers page", () => {
    const providers = new Set(
        getModels().map((model) => getRegistryModelDefinition(model).provider),
    );
    // An unmapped id shows up raw in the expected line; add it to PROVIDER_NAMES.
    const line = [...providers]
        .map((provider) => PROVIDER_NAMES[provider] ?? provider)
        .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
        .join(", ");
    expect(SERVICE_PROVIDERS_PAGE).toContain(`\n${line}.\n`);
});
