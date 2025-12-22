// DocsPage content configuration

export const DOCS_PAGE = {
    title: {
        text: "Integrate",
    },

    intro: {
        text: "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
    },

    apiReference: {
        text: "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
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

    modelSelectLabel: {
        text: "Model",
    },

    parametersLabel: {
        text: "Parameters",
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

    // Image parameters (from API docs)
    imageParameters: [
        { key: "width", value: "1024", description: "Image width in pixels" },
        { key: "height", value: "1024", description: "Image height in pixels" },
        { key: "seed", value: "42", description: "Random seed for reproducible results" },
        { key: "enhance", value: "true", description: "Let AI improve your prompt" },
        { key: "nologo", value: "true", description: "Remove Pollinations watermark" },
        { key: "safe", value: "true", description: "Enable safety filters" },
        { key: "private", value: "true", description: "Hide from public feeds" },
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

    // Text parameters (from API docs)
    textParameters: [
        { key: "system", value: "You are helpful", description: "System prompt for context" },
        { key: "json", value: "true", description: "Return response in JSON format" },
        { key: "temperature", value: "0.7", description: "Creativity (0=strict, 2=creative)" },
        { key: "stream", value: "true", description: "Stream response in real-time" },
        { key: "private", value: "true", description: "Hide from public feeds" },
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
        text: "Rate limited: 3 req/burst, 1/15sec refill",
    },

    publishableFeature3: {
        text: "Best for: demos, prototypes, public tools",
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
        text: "No rate limits, can spend Pollen",
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

    // API base URL for display
    apiBaseUrl: {
        text: "gen.pollinations.ai",
    },
};
