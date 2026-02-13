/**
 * Provider registry — maps internal provider keys to display names and models.
 *
 * To add a new provider, add a single entry here. The display name is used in
 * user-facing error messages and the `provider` field of error responses.
 */
export const PROVIDERS: Record<string, { name: string; models: string[] }> = {
    airforce: {
        name: "api.airforce",
        models: ["imagen-4", "grok-video"],
    },
    azure_gpt: {
        name: "Azure GPT Image",
        models: ["gptimage", "gptimage-large"],
    },
    azure_kontext: {
        name: "Azure Flux Kontext",
        models: ["kontext"],
    },
    seedream: {
        name: "ByteDance Seedream",
        models: ["seedream", "seedream-pro"],
    },
    klein: {
        name: "Modal Flux Klein",
        models: ["klein", "klein-large"],
    },
    vertex: {
        name: "Vertex AI Gemini",
        models: ["nanobanana", "nanobanana-pro"],
    },
    veo: {
        name: "Google Veo",
        models: ["veo"],
    },
    seedance: {
        name: "ByteDance Seedance",
        models: ["seedance", "seedance-pro"],
    },
    wan: {
        name: "Wan Video",
        models: ["wan"],
    },
    ltx2: {
        name: "LTX-2 Video",
        models: ["ltx-2"],
    },
    self_hosted: {
        name: "Pollinations",
        models: ["flux"],
    },
};

/** Reverse lookup — built once at import time */
const modelToProvider = new Map<string, string>();
for (const entry of Object.values(PROVIDERS)) {
    for (const model of entry.models) {
        modelToProvider.set(model, entry.name);
    }
}

/**
 * Returns the display name of the upstream provider for a given model.
 * Falls back to `"unknown"` for unregistered models.
 *
 * @param model - The model identifier (e.g. "imagen-4", "gptimage")
 * @returns The provider display name (e.g. "api.airforce", "Azure GPT Image")
 */
export function getProviderForModel(model: string): string {
    return modelToProvider.get(model) ?? "unknown";
}
