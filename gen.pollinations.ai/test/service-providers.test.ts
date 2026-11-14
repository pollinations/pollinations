import {
    getModels,
    getRegistryModelDefinition,
} from "@shared/registry/registry.ts";
import { expect, it } from "vitest";
import SERVICE_PROVIDERS_RAW from "../../pollinations.ai/public/legal/SUBPROCESSORS.md?raw";

// `?raw` hands back the file as it sits on disk, so a Windows checkout with
// core.autocrlf=true (the Git for Windows default) yields CRLF and the page's
// line endings must not decide whether this test passes.
const SERVICE_PROVIDERS_PAGE = SERVICE_PROVIDERS_RAW.replace(/\r\n?/g, "\n");

// Registry `provider` ids as named on the public Service Providers page.
const PROVIDER_NAMES: Record<string, string> = {
    alibaba: "Alibaba Cloud",
    anthropic: "Anthropic",
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
    "vllm-sr": "vLLM Semantic Router",
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
