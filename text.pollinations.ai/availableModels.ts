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
import { TEXT_SERVICES } from "../shared/registry/text.js";
import {
    resolveServiceId,
    getServiceAliases,
} from "../shared/registry/registry.js";

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof TEXT_SERVICES;

// Helper to extract business logic properties from TEXT_SERVICES
function getServiceProps(name: ValidServiceName) {
    const service = TEXT_SERVICES[name] as any;
    return {
        tier: service.tier as "anonymous" | "seed" | "flower" | "nectar",
        ...(service.persona && { community: true }),
        ...(service.reasoning && { reasoning: true }),
        ...(service.uncensored && { uncensored: true }),
    };
}

// Helper to get display properties for /models endpoint
export function getDisplayProps(name: ValidServiceName) {
    const service = TEXT_SERVICES[name] as any;
    return {
        description: service.description!,
        input_modalities: service.input_modalities!,
        output_modalities: service.output_modalities!,
        tools: true, // Default for all models
        ...(service.voices && { voices: service.voices }),
    };
}

interface ModelDefinition extends ReturnType<typeof getServiceProps> {
    // Required properties
    name: ValidServiceName;
    description: string;
    config: (typeof portkeyConfig)[ValidModelId]; // ✅ Type-safe: must be a valid model ID from TEXT_COSTS
    transform?: any;
    community?: boolean;
    // aliases removed - now sourced from registry
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    uncensored?: boolean;
    hidden?: boolean;
    voices?: string[];
    supportsSystemMessages?: boolean;
}

const models: ModelDefinition[] = [
    {
        name: "openai",
        ...getServiceProps("openai"),
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-fast",
        ...getServiceProps("openai-fast"),
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-large",
        ...getServiceProps("openai-large"),
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "qwen-coder",
        ...getServiceProps("qwen-coder"),
        config: portkeyConfig["qwen2.5-coder-32b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
        community: false,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "mistral",
        ...getServiceProps("mistral"),
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
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
    // 	community: false,
    // 	input_modalities: ["text"],
    // 	output_modalities: ["text"],
    // 	tools: true
    // },
    {
        name: "deepseek",
        description: "DeepSeek V3.1",
        config: portkeyConfig["myceli-deepseek-v3.1"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        reasoning: true,
        community: false,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-audio",
        description: "OpenAI GPT-4o Mini Audio Preview",
        voices: [
            "alloy",
            "echo",
            "fable",
            "onyx",
            "nova",
            "shimmer",
            "coral",
            "verse",
            "ballad",
            "ash",
            "sage",
            "amuch",
            "dan",
        ],
        config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
        community: false,
        input_modalities: ["text", "image", "audio"],
        output_modalities: ["audio", "text"],
        tools: true,
    },
    // {
    // 	name: "nova-fast",
    // 	description: "Amazon Nova Micro",
    // 	config: portkeyConfig["amazon.nova-micro-v1:0"],
    // 	transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    // 	community: false,
    // 	input_modalities: ["text"],
    // 	output_modalities: ["text"],
    // 	tools: true
    // },
    {
        name: "roblox-rp",
        ...getServiceProps("roblox-rp"),
        config: portkeyConfig["us.meta.llama3-1-8b-instruct-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        community: false,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "claudyclaude",
        ...getServiceProps("claudyclaude"),
        config: portkeyConfig["us.anthropic.claude-haiku-4-5-20251001-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-reasoning",
        ...getServiceProps("openai-reasoning"),
        config: portkeyConfig["openai/o4-mini"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            removeSystemMessages,
        ),
        community: false,
        reasoning: true,
        supportsSystemMessages: false,
    },
    {
        name: "o4-mini",
        ...getServiceProps("o4-mini"),
        config: portkeyConfig["o4-mini"],
        supportsSystemMessages: false,
    },
    {
        name: "gemini",
        ...getServiceProps("gemini"),
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "gemini-search",
        ...getServiceProps("gemini-search"),
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(createGoogleSearchTransform()),
        community: false,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },

    // ======================================
    // Persona Models (use upstream endpoints)
    // ======================================

    {
        name: "unity",
        ...getServiceProps("unity"),
        config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
        transform: createMessageTransform(unityPrompt),
        uncensored: true,
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "midijourney",
        ...getServiceProps("midijourney"),
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(midijourneyPrompt),
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "rtist",
        ...getServiceProps("rtist"),
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(rtistPrompt),
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "evil",
        ...getServiceProps("evil"),
        config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
        transform: createMessageTransform(evilPrompt),
        uncensored: true,
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "bidara",
        ...getServiceProps("bidara"),
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(bidaraSystemPrompt),
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "chickytutor",
        ...getServiceProps("chickytutor"),
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(chickyTutorPrompt),
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
];

// Export models with display properties, aliases, and computed properties
export const availableModels = models.map((model) => {
    // Get display properties from registry
    const displayProps = getDisplayProps(model.name);
    const inputs = displayProps.input_modalities || [];
    const outputs = displayProps.output_modalities || [];

    // Get aliases from registry (single source of truth)
    const aliases = getServiceAliases(model.name);

    return {
        ...model,
        ...displayProps, // Add description, input/output modalities, tools, voices
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
