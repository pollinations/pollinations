// Utility to fetch and combine model information from registries

// Fallback data for when API calls fail
const fallbackTextModels = [
    {
        name: "openai",
        description: "OpenAI GPT-5 Nano",
        tier: "anonymous",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-fast",
        description: "OpenAI GPT-4.1 Nano",
        tier: "anonymous",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-large",
        description: "OpenAI GPT-5 Chat",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "qwen-coder",
        description: "Qwen 2.5 Coder 32B",
        tier: "anonymous",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "mistral",
        description: "Mistral Small 3.2 24B",
        tier: "anonymous",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "deepseek",
        description: "DeepSeek V3.1",
        tier: "seed",
        reasoning: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-audio",
        description: "OpenAI GPT-4o Mini Audio Preview",
        tier: "seed",
        input_modalities: ["text", "image", "audio"],
        output_modalities: ["audio", "text"],
        tools: true,
    },
    {
        name: "claudyclaude",
        description: "Claude Haiku 4.5",
        tier: "flower",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-reasoning",
        description: "OpenAI o4 Mini",
        tier: "seed",
        reasoning: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "gemini",
        description: "Gemini 2.5 Flash Lite",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "gemini-search",
        description: "Gemini 2.5 Flash Lite with Google Search",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "unity",
        description: "Unity Unrestricted Agent",
        tier: "seed",
        uncensored: true,
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "midijourney",
        description: "MIDIjourney",
        tier: "anonymous",
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
];

const fallbackImageModels = [
    {
        name: "flux",
        description: "Flux - High quality image generation",
        tier: "seed",
        enhance: true,
        maxSideLength: 768,
    },
    {
        name: "kontext",
        description: "Azure Flux Kontext - General purpose model",
        tier: "seed",
        enhance: true,
        maxSideLength: 1024,
    },
    {
        name: "turbo",
        description: "Turbo - Fast image generation",
        tier: "seed",
        enhance: true,
        maxSideLength: 768,
    },
    {
        name: "gptimage",
        description: "GPT Image 1 Mini",
        tier: "seed",
        enhance: false,
        maxSideLength: 1024,
    },
];

/**
 * Fetches text models from the API
 * @returns {Promise<Array>} Array of text model objects
 */
export async function fetchTextModels() {
    try {
        const response = await fetch("https://text.pollinations.ai/models");
        if (!response.ok) {
            throw new Error("Failed to fetch text models");
        }
        return await response.json();
    } catch (error) {
        console.warn("Using fallback text models due to API error:", error);
        return fallbackTextModels;
    }
}

/**
 * Fetches image models from the API
 * @returns {Promise<Array>} Array of image model objects
 */
export async function fetchImageModels() {
    try {
        const response = await fetch("https://image.pollinations.ai/about");
        if (!response.ok) {
            throw new Error("Failed to fetch image models");
        }
        return await response.json();
    } catch (error) {
        console.warn("Using fallback image models due to API error:", error);
        return fallbackImageModels;
    }
}

/**
 * Fetches all models and categorizes them
 * @returns {Promise<{textModels: Array, imageModels: Array}>} Object with categorized models
 */
export async function getAllModels() {
    const [textModels, imageModels] = await Promise.all([
        fetchTextModels(),
        fetchImageModels()
    ]);
    
    return {
        textModels,
        imageModels
    };
}
