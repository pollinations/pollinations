// Import registry types for validation
import type { IMAGE_SERVICES } from "../../shared/registry/image.ts";

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

interface ModelDefinition {
    type: string;
    enhance: boolean;
    maxSideLength: number;
    tier: "anonymous" | "seed" | "flower" | "nectar";
}

type ModelsConfig = {
    [K in ValidServiceName]: ModelDefinition;
};

export const MODELS: ModelsConfig = {
    flux: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
        tier : "seed",
    },

    // Azure Flux Kontext - general purpose model
    kontext: {
        type: "azure-flux-kontext",
        enhance: true,
        maxSideLength: 1024, // Azure Flux Kontext standard resolution
        tier: "seed",
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
        tier: "seed",
    },

    // // Nano Banana - Gemini 2.5 Flash Image Preview via Vertex AI
    // nanobanana: {
    //     type: "vertex-ai",
    //     enhance: false,
    //     maxSideLength: 1024,
    //     tier: "flower",
    // },

    // // Seedream - ByteDance ARK API for high-quality image generation
    // seedream: {
    //     type: "seedream",
    //     enhance: false,
    //     maxSideLength: 2048, // Default 2048x2048, supports up to 4K resolution
    //     tier: "flower",
    // },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        enhance: false,
        maxSideLength: 1024,
        tier: "seed",
    },
};
