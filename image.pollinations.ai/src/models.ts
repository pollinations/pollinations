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
    // "flux-realism": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-cablyai": { type: "meoow-2", enhance: false, maxSideLength: 1384 },
    // "flux-anime": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-3d": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "any-dark": { type: "meoow", enhance: false, maxSideLength: 1384 },
    // "flux-pro": { type: "meoow-2", enhance:  false, maxSideLength: 1512 },

    flux: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
        tier : "seed",
    },

    // BPAIGen with Kontext fallback - general purpose model
    kontext: {
        type: "bpaigen-kontext",
        enhance: true,
        maxSideLength: 1216, // BPAIGen's higher resolution capability
        tier: "seed",
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
        tier: "seed",
    },

    // Nano Banana - Gemini 2.5 Flash Image Preview via Vertex AI
    nanobanana: {
        type: "vertex-ai",
        enhance: false,
        maxSideLength: 1024,
        tier: "seed",
    },

    // Seedream - ByteDance ARK API for high-quality image generation
    seedream: {
        type: "seedream",
        enhance: false,
        maxSideLength: 2048, // Default 2048x2048, supports up to 4K resolution
        tier: "nectar",
    },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        enhance: false,
        maxSideLength: 1024,
        tier: "seed",
    },
};
