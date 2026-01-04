// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import {
    createSystemPromptTransform,
    removeSystemMessages,
} from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGoogleSearchTransform } from "./transforms/createGoogleSearchTransform.js";

// Import persona prompts
import unityPrompt from "./personas/unity.js";
import midijourneyPrompt from "./personas/midijourney.js";
import rtistPrompt from "./personas/rtist.js";
import evilPrompt from "./personas/evil.js";
import { bidaraSystemPrompt } from "./personas/bidara.js";
import chickyTutorPrompt from "./personas/chickytutor.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig, type ValidModelId } from "./configs/modelConfigs.js";

// Import registry for validation and aliases
import type { TEXT_SERVICES } from "../shared/registry/text.js";
import {
    resolveServiceId,
    getServiceAliases,
} from "../shared/registry/registry.js";

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof TEXT_SERVICES;

interface ModelDefinition {
    name: ValidServiceName;
    description: string;
    config: (typeof portkeyConfig)[ValidModelId]; // ✅ Type-safe: must be a valid model ID from TEXT_COSTS
    transform?: any;
    tier: "anonymous" | "seed" | "flower" | "nectar";
    community?: boolean;
    // aliases removed - now sourced from registry
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    maxInputChars?: number;
    reasoning?: boolean;
    uncensored?: boolean;
    hidden?: boolean;
    voices?: string[];
    supportsSystemMessages?: boolean;
}

const models: ModelDefinition[] = [
    {
        name: "openai",
        description: "OpenAI GPT-5 Nano",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        tier: "anonymous",
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
        maxInputChars: 7000,
    },
    {
        name: "openai-fast",
        description: "OpenAI GPT-4.1 Nano",
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        tier: "anonymous",
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
        maxInputChars: 5000,
    },
    // Temporarily disabled
    // {
    //     name: "openai-large",
    //     description: "OpenAI GPT-4.1",
    //     config: portkeyConfig["gpt-4.1-2025-04-14"],
    //     transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    //     tier: "seed",
    //     community: false,
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    //     maxInputChars: 10000,
    // },
    // {
    //     name: "qwen-coder",
    //     description: "Qwen 2.5 Coder 32B",
    //     config: portkeyConfig["qwen2.5-coder-32b-instruct"],
    //     transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    //     tier: "flower",
    //     community: false,
    //     input_modalities: ["text"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    {
        name: "mistral",
        description: "Mistral Small 3.2 24B",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        tier: "anonymous",
        community: false,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    // {
    // 	name: "mistral-naughty",
    // 	description: "Mistral Nemo Instruct 2407",
    // 	config: portkeyConfig["mistral-nemo-instruct-2407"],
    // 	transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    // 	tier: "flower",
    // 	community: false,
    // 	input_modalities: ["text"],
    // 	output_modalities: ["text"],
    // 	tools: true
    // },
    // {
    //     name: "deepseek",
    //     description: "DeepSeek V3.1",
    //     maxInputChars: 10000,
    //     config: portkeyConfig["myceli-deepseek-v3.1"],
    //     transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    //     reasoning: true,
    //     tier: "seed",
    //     community: false,
    //     input_modalities: ["text"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    // Disabled - available via enter.pollinations.ai
    // {
    //     name: "openai-audio",
    //     description: "OpenAI GPT-4o Mini Audio Preview",
    //     maxInputChars: 2500,
    //     voices: [
    //         "alloy",
    //         "echo",
    //         "fable",
    //         "onyx",
    //         "nova",
    //         "shimmer",
    //         "coral",
    //         "verse",
    //         "ballad",
    //         "ash",
    //         "sage",
    //         "amuch",
    //         "dan",
    //     ],
    //     config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
    //     tier: "seed",
    //     community: false,
    //     input_modalities: ["text", "image", "audio"],
    //     output_modalities: ["audio", "text"],
    //     tools: true,
    // },
    // {
    // 	name: "nova-fast",
    // 	description: "Amazon Nova Micro",
    // 	config: portkeyConfig["amazon.nova-micro-v1:0"],
    // 	transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    // 	community: false,
    // 	tier: "anonymous",
    // 	input_modalities: ["text"],
    // 	output_modalities: ["text"],
    // 	tools: true
    // },
    // {
    //     name: "roblox-rp",
    //     description: "Llama 3.1 8B Instruct",
    //     config: portkeyConfig["us.meta.llama3-1-8b-instruct-v1:0"],
    //     transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    //     tier: "seed",
    //     community: false,
    //     input_modalities: ["text"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    // {
    //     name: "claudyclaude",
    //     description: "Claude Haiku 4.5",
    //     config: portkeyConfig["us.anthropic.claude-haiku-4-5-20251001-v1:0"],
    //     transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    //     tier: "flower",
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    // Disabled - available via enter.pollinations.ai
    // {
    //     name: "openai-reasoning",
    //     description: "OpenAI o4 Mini",
    //     config: portkeyConfig["openai/o4-mini"],
    //     transform: pipe(
    //         createSystemPromptTransform(BASE_PROMPTS.conversational),
    //         removeSystemMessages,
    //     ),
    //     tier: "seed",
    //     community: false,
    //     reasoning: true,
    //     supportsSystemMessages: false,
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    {
        name: "gemini",
        description: "Gemini 2.5 Flash Lite",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        tier: "anonymous",
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    // {
    //     name: "gemini-search",
    //     description: "Gemini 2.5 Flash Lite with Google Search",
    //     config: portkeyConfig["gemini-2.5-flash-lite"],
    //     transform: pipe(createGoogleSearchTransform()),
    //     tier: "seed",
    //     community: false,
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },

    // ======================================
    // Persona Models (use upstream endpoints)
    // ======================================

    // {
    //     name: "unity",
    //     description: "Unity Unrestricted Agent",
    //     config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
    //     transform: createMessageTransform(unityPrompt),
    //     uncensored: true,
    //     tier: "seed",
    //     community: true,
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    {
        name: "midijourney",
        description: "MIDIjourney",
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createMessageTransform(midijourneyPrompt),
        tier: "anonymous",
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    // {
    //     name: "rtist",
    //     description: "Rtist",
    //     config: portkeyConfig["gpt-4.1-2025-04-14"],
    //     transform: createMessageTransform(rtistPrompt),
    //     tier: "seed",
    //     community: true,
    //     input_modalities: ["text"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    // {
    //     name: "evil",
    //     description: "Evil",
    //     config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
    //     transform: createMessageTransform(evilPrompt),
    //     uncensored: true,
    //     tier: "seed",
    //     community: true,
    //     input_modalities: ["text", "image"],
    //     output_modalities: ["text"],
    //     tools: true,
    // },
    {
        name: "bidara",
        description:
            "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(bidaraSystemPrompt),
        tier: "anonymous",
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "chickytutor",
        description: "ChickyTutor AI Language Tutor - (chickytutor.com)",
        config: portkeyConfig["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        transform: createMessageTransform(chickyTutorPrompt),
        tier: "anonymous",
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
];

// Export models with aliases from registry and computed properties
export const availableModels = models.map((model) => {
    const inputs = model.input_modalities || [];
    const outputs = model.output_modalities || [];

    // Get aliases from registry (single source of truth)
    const aliases = getServiceAliases(model.name);

    return {
        ...model,
        aliases, // ✅ Sourced from registry
        vision: inputs.includes("image"),
        audio: inputs.includes("audio") || outputs.includes("audio"),
    };
});

/**
 * Find a model definition by name or alias
 * Uses registry to resolve aliases to service names
 * @param modelName - The name or alias of the model to find
 * @returns The model definition or null if not found
 */
export function findModelByName(modelName: string) {
    // First try direct lookup
    const directMatch = availableModels.find(
        (model) => model.name === modelName,
    );
    if (directMatch) return directMatch;

    // Try resolving via registry (handles aliases)
    try {
        const resolvedServiceId = resolveServiceId(modelName, "generate.text");
        return (
            availableModels.find((model) => model.name === resolvedServiceId) ||
            null
        );
    } catch {
        return null;
    }
}
