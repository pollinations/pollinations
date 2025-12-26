// DocsPage content configuration

export const DOCS_PAGE = {
    title: "Integrate",

    intro: "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",

    apiReference:
        "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",

    // Top buttons
    fullApiDocsButton: "Full API Docs",
    agentPromptButton: "Agent Prompt",
    copiedLabel: "Copied!",

    // ImageGenCard
    imageGenerationTitle: "Image Generation",
    pickPromptLabel: "Pick a prompt",
    modelSelectLabel: "Model",
    parametersLabel: "Parameters",
    generatingLabel: "Generating...",
    copyUrlButton: "Copy URL",

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
        { key: "safe", value: "true", description: "Enable safety filters" },
        {
            key: "private",
            value: "true",
            description: "Hide from public feeds",
        },
    ],

    // TextGenCard
    textGenerationTitle: "Text Generation",
    modelLabel: "Model",
    defaultModelLabel: "Default: openai",
    optionalLabel: "Optional",

    // Text prompts array
    textPrompts: [
        "explain pollinations.ai",
        "write a poem about nature",
        "describe ecosystem harmony",
        "explain symbiosis",
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
    modelDiscoveryTitle: "Model Discovery",
    selectTypeLabel: "Select a type",
    imageTypeLabel: "Image",
    textTypeLabel: "Text",
    textOpenAITypeLabel: "Text (OpenAI)",
    loadingModelsLabel: "Loading models...",

    // AuthCard
    authenticationTitle: "Authentication",
    keyTypesLabel: "Key Types",
    publishableLabel: "Publishable",
    publishableFeature1: "Safe for client-side code",
    publishableFeature2: "Rate limited: 3 req/burst, 1/15sec refill",
    publishableFeature3: "Best for: demos, prototypes, public tools",
    secretLabel: "Secret",
    secretFeature1: "Server-side only",
    secretFeature2: "Never expose publicly",
    secretFeature3: "No rate limits, can spend Pollen",
    getYourKeyLabel: "Get Your Key",
    usageExamplesLabel: "Usage Examples",
    serverSideDescription:
        "Server-side (Recommended): Use secret key in Authorization header",
    clientSideDescription:
        "Client-side (Public): Use publishable key in query parameter",

    // API base URL for display
    apiBaseUrl: "gen.pollinations.ai",
};
