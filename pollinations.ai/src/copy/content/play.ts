// PlayPage content configuration

export const PLAY_PAGE = {
    // Page titles and navigation
    createTitle: "Create",
    watchTitle: "Watch",
    createDescription:
        "Try any model. This is a fun demo playground—not our main product, just a place to explore and experiment.",
    pricingLinkText: "See pricing",
    feedDescription:
        "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
    toggleWatchOthers: "Watch what others are making",
    toggleBackToPlay: "Back to Play",

    // PlayGenerator UI labels
    modelsLabel: "Models",
    imageLabel: "Image",
    textLabel: "Text",
    promptLabel: "Prompt",
    imagePlaceholder: "Describe the image you want...",
    textPlaceholder: "Enter your question or prompt...",
    addImagesLabel: "Add Images (Optional)",
    upToFourLabel: "up to 4",

    // Image parameter labels
    widthLabel: "Width",
    heightLabel: "Height",
    seedLabel: "Seed",
    seedPlaceholder: "0 = random",
    enhanceLabel: "Enhance",
    logoLabel: "Logo",

    // Reference images
    referenceImagesLabel: "Reference images",
    referenceImagesCount: "/4 images",
    imageUrlPlaceholder: "Image URL",

    // Button states
    generatingText: "Generating...",
    generateImageButton: "Generate Image",
    generateTextButton: "Generate Text",
    generateAudioButton: "Generate Audio",
    generateVideoButton: "Generate Video",

    // Tooltips
    seedTooltip: "Same seed + same prompt = same image",
    enhanceTooltip: "AI improves your prompt for better results",

    // Model selector
    audioLabel: "Audio",
    videoLabel: "Video",

    // Voice selector
    voiceLabel: "Voice",

    // Image feed
    waitingForImages: "Waiting for images...",
    waitingForContent: "Waiting for content...",
    listeningTo: "Listening to",
    feedPromptLabel: "Prompt",
    feedModelLabel: "Model",
    noPromptAvailable: "No prompt available",
    noPromptFallback: "No prompt",
    noModelFallback: "-",

    // Auth
    loginButton: "Login",
    logoutButton: "Logout",
    loggedInAsLabel: "Logged in as",
    balanceLabel: "Balance",
    apiKeyLabel: "API Key",
    pollenUnit: "Pollen",

    // Login CTA
    loginCtaLogin: "Login",
    loginCtaSuffix: "to unlock all models and get API keys",
    loggedInCtaText: "Selected models are now unlocked!",

    // Validation
    enterPromptFirst: "First, enter a prompt",

    // Gated model tooltip
    gatedModelTooltip:
        "Login to unlock · Get API keys at enter.pollinations.ai",

    // Error messages
    somethingWentWrong: "Something went wrong",
    noResponse: "No response",

    // Integrate section (API URL + Auth combined)
    integrateTitle: "Integrate",
    integrateIntro:
        "Simple GET URLs for image, text, and audio. Embed in <img> tags, fetch, or open in a browser. An API key is required for all requests.",
    copyButton: "Copy",
    copiedLabel: "Copied!",
    fullApiDocsButton: "Full API Docs",
    agentPromptButton: "Agent Prompt",

    // Authentication
    authTitle: "Authentication",
    authIntro:
        "API keys authenticate your requests. Create multiple keys for different apps and track usage separately.",
    publishableLabel: "Publishable",
    publishableFeature1: "Client-side demos & prototypes",
    publishableFeature2: "Rate limited: 1 pollen per IP per hour",
    publishableBetaWarning:
        "Beta — Turnstile protection coming soon. Not recommended for production yet.",
    secretLabel: "Secret",
    secretFeature1: "Server-side only",
    secretFeature2: "No rate limits",
    secretWarning:
        "Never expose in client-side code, git repos, or public URLs",
    byopLabel: "Bring Your Own Pollen",
    byopDescription:
        "Building an app? Let users pay for their own AI usage — you pay $0.",
    getKeyButton: "Get Your Key",
    byopButton: "Learn more",
};
