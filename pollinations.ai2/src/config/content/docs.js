// DocsPage content configuration

export const DOCS_PAGE = {
    title: {
        text: "Integrate",
    },

    intro: {
        text: "Write 2 sentences about our API being simple, powerful, and elegant. Single endpoint for text, images, audio. This is where your vision takes flight. Keep it inspiring and brief. Gen Z vibe.",
        seed: 0,
        style: "genZ",
        maxWords: 40,
    },

    apiReference: {
        text: "Write 1-2 sentences explaining we have full API docs for deep dives, and for AI agents working with our API, we have an optimized prompt they can copy/paste. Keep it helpful and brief.",
        seed: 0,
        style: "professional",
        maxWords: 35,
    },

    // Top buttons
    fullApiDocsButton: {
        text: "Full API Docs",
    },

    agentPromptButton: {
        text: "Agent Prompt",
    },

    copiedLabel: {
        text: "Copied!",
    },

    // ImageGenCard
    imageGenerationTitle: {
        text: "Image Generation",
    },

    pickPromptLabel: {
        text: "Pick a prompt",
    },

    optionalParametersLabel: {
        text: "Optional parameters",
    },

    generatingLabel: {
        text: "Generating...",
    },

    copyUrlButton: {
        text: "Copy URL",
    },

    // Image prompts array
    imagePrompts: [
        "a blooming flower in golden hour",
        "bees pollinating wildflowers",
        "organic mycelium network patterns",
        "harmonious forest ecosystem",
        "symbiotic nature interactions",
        "flowing river through biosphere",
    ],

    // TextGenCard
    textGenerationTitle: {
        text: "Text Generation",
    },

    modelLabel: {
        text: "Model",
    },

    defaultModelLabel: {
        text: "Default: openai",
    },

    optionalLabel: {
        text: "Optional",
    },

    // Text prompts array
    textPrompts: [
        "explain pollinations.ai",
        "write a poem about nature",
        "describe ecosystem harmony",
        "explain symbiosis",
    ],

    // ModelDiscoveryCard
    modelDiscoveryTitle: {
        text: "Model Discovery",
    },

    selectTypeLabel: {
        text: "Select a type",
    },

    imageTypeLabel: {
        text: "Image",
    },

    textTypeLabel: {
        text: "Text",
    },

    textOpenAITypeLabel: {
        text: "Text (OpenAI)",
    },

    loadingModelsLabel: {
        text: "Loading models...",
    },

    // AuthCard
    authenticationTitle: {
        text: "Authentication",
    },

    keyTypesLabel: {
        text: "Key Types",
    },

    publishableLabel: {
        text: "Publishable",
    },

    publishableFeature1: {
        text: "Safe for client-side code",
    },

    publishableFeature2: {
        text: "1 pollen/hour per IP+key",
    },

    publishableFeature3: {
        text: "Beta: Use secret keys for production",
    },

    secretLabel: {
        text: "Secret",
    },

    secretFeature1: {
        text: "Server-side only",
    },

    secretFeature2: {
        text: "Never expose publicly",
    },

    secretFeature3: {
        text: "No rate limits",
    },

    getYourKeyLabel: {
        text: "Get Your Key",
    },

    usageExamplesLabel: {
        text: "Usage Examples",
    },

    serverSideDescription: {
        text: "Server-side (Recommended): Use secret key in Authorization header",
    },

    clientSideDescription: {
        text: "Client-side (Public): Use publishable key in query parameter",
    },
};
