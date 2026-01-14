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
    authIntro:
        "API keys authenticate your requests. Create multiple keys for different apps and track usage separately.",
    modelScopingLabel: "🎯 Per-Model Access",
    modelScopingDescription:
        "Restrict each key to specific models — e.g., allow only flux + openai, or just gptimage.",
    keyTypesLabel: "Key Types",
    publishableLabel: "Publishable",
    publishableFeature1: "Client-side demos & prototypes",
    publishableFeature2: "Rate limited: 1 pollen per IP per hour",
    publishableBetaWarning:
        "⚠️ Beta — Turnstile protection coming soon. Not recommended for production yet.",
    secretLabel: "Secret",
    secretFeature1: "Server-side only",
    secretFeature2: "No rate limits",
    secretWarning:
        "⚠️ Never expose in client-side code, git repos, or public URLs",

    // Shared example section
    usageExampleTitle: "Usage",
    getYourKeyLabel: "Get Your Key",

    // Call to Action
    ctaLabel: "Ready to build?",
    ctaDocsLabel: "View API Docs",
};
