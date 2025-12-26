// DocsPage content configuration

export const DOCS_PAGE = {
    title: {
        text: "Integrate",
        translate: true,
    },

    intro: {
        text: "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
        transform: true,
    },

    apiReference: {
        text: "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
        transform: true,
    },

    // Top buttons
    fullApiDocsButton: {
        text: "Full API Docs",
        translate: true,
    },

    agentPromptButton: {
        text: "Agent Prompt",
        translate: true,
    },

    copiedLabel: {
        text: "Copied!",
        translate: true,
    },

    // ImageGenCard
    imageGenerationTitle: {
        text: "Image Generation",
        translate: true,
    },

    pickPromptLabel: {
        text: "Pick a prompt",
        translate: true,
    },

    modelSelectLabel: {
        text: "Model",
        translate: true,
    },

    parametersLabel: {
        text: "Parameters",
        translate: true,
    },

    generatingLabel: {
        text: "Generating...",
        translate: true,
    },

    copyUrlButton: {
        text: "Copy URL",
        translate: true,
    },

    // Image prompts array (translatable)
    imagePrompts: [
        { text: "a blooming flower in golden hour", translate: true },
        { text: "bees pollinating wildflowers", translate: true },
        { text: "organic mycelium network patterns", translate: true },
        { text: "harmonious forest ecosystem", translate: true },
        { text: "symbiotic nature interactions", translate: true },
        { text: "flowing river through biosphere", translate: true },
    ],

    // Image parameters (from API docs)
    imageParameters: [
        { key: "width", value: "1024", description: "Image width in pixels" },
        { key: "height", value: "1024", description: "Image height in pixels" },
        {
            key: "seed",
            value: "42",
            description: "Random seed for reproducible results",
        },
        {
            key: "enhance",
            value: "true",
            description: "Let AI improve your prompt",
        },
        {
            key: "nologo",
            value: "true",
            description: "Remove pollinations.ai watermark",
        },
        { key: "safe", value: "true", description: "Enable safety filters" },
        {
            key: "private",
            value: "true",
            description: "Hide from public feeds",
        },
    ],

    // TextGenCard
    textGenerationTitle: {
        text: "Text Generation",
        translate: true,
    },

    modelLabel: {
        text: "Model",
        translate: true,
    },

    defaultModelLabel: {
        text: "Default: openai",
        translate: true,
    },

    optionalLabel: {
        text: "Optional",
        translate: true,
    },

    // Text prompts array (translatable)
    textPrompts: [
        { text: "explain pollinations.ai", translate: true },
        { text: "write a poem about nature", translate: true },
        { text: "describe ecosystem harmony", translate: true },
        { text: "explain symbiosis", translate: true },
    ],

    // Text parameters (from API docs)
    textParameters: [
        {
            key: "system",
            value: "You are helpful",
            description: "System prompt for context",
        },
        {
            key: "json",
            value: "true",
            description: "Return response in JSON format",
        },
        {
            key: "temperature",
            value: "0.7",
            description: "Creativity (0=strict, 2=creative)",
        },
        {
            key: "stream",
            value: "true",
            description: "Stream response in real-time",
        },
        {
            key: "private",
            value: "true",
            description: "Hide from public feeds",
        },
    ],

    // ModelDiscoveryCard
    modelDiscoveryTitle: {
        text: "Model Discovery",
        translate: true,
    },

    selectTypeLabel: {
        text: "Select a type",
        translate: true,
    },

    imageTypeLabel: {
        text: "Image",
        translate: true,
    },

    textTypeLabel: {
        text: "Text",
        translate: true,
    },

    textOpenAITypeLabel: {
        text: "Text (OpenAI)",
        translate: true,
    },

    loadingModelsLabel: {
        text: "Loading models...",
        translate: true,
    },

    // AuthCard
    authenticationTitle: {
        text: "Authentication",
        translate: true,
    },

    keyTypesLabel: {
        text: "Key Types",
        translate: true,
    },

    publishableLabel: {
        text: "Publishable",
        translate: true,
    },

    publishableFeature1: {
        text: "Safe for client-side code",
        translate: true,
    },

    publishableFeature2: {
        text: "Rate limited: 3 req/burst, 1/15sec refill",
        translate: true,
    },

    publishableFeature3: {
        text: "Best for: demos, prototypes, public tools",
        translate: true,
    },

    secretLabel: {
        text: "Secret",
        translate: true,
    },

    secretFeature1: {
        text: "Server-side only",
        translate: true,
    },

    secretFeature2: {
        text: "Never expose publicly",
        translate: true,
    },

    secretFeature3: {
        text: "No rate limits, can spend Pollen",
        translate: true,
    },

    getYourKeyLabel: {
        text: "Get Your Key",
        translate: true,
    },

    usageExamplesLabel: {
        text: "Usage Examples",
        translate: true,
    },

    serverSideDescription: {
        text: "Server-side (Recommended): Use secret key in Authorization header",
        translate: true,
    },

    clientSideDescription: {
        text: "Client-side (Public): Use publishable key in query parameter",
        translate: true,
    },

    // API base URL for display
    apiBaseUrl: {
        text: "gen.pollinations.ai",
    },
};
