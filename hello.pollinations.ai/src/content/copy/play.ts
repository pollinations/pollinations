// PlayPage content configuration

export const PLAY_PAGE = {
    // Page titles and navigation
    createTitle: {
        text: "Create",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    watchTitle: {
        text: "Watch",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    createDescription: {
        text: "Test our API, play with different models, and see what you can create. This is a fun demo playground—not our main product, just a place to explore and experiment.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    feedDescription: {
        text: "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    toggleWatchOthers: {
        text: "Watch what others are making",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    toggleBackToPlay: {
        text: "Back to Play",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    // PlayGenerator UI labels
    modelsLabel: {
        text: "Models",
    },

    imageLabel: {
        text: "Image",
    },

    textLabel: {
        text: "Text",
    },

    promptLabel: {
        text: "Prompt",
    },

    imagePlaceholder: {
        text: "Describe the image you want...",
    },

    textPlaceholder: {
        text: "Enter your question or prompt...",
    },

    addImagesLabel: {
        text: "Add Images (Optional)",
    },

    upToFourLabel: {
        text: "up to 4",
    },

    // Image parameter labels
    widthLabel: {
        text: "Width",
    },

    heightLabel: {
        text: "Height",
    },

    seedLabel: {
        text: "Seed",
    },

    seedPlaceholder: {
        text: "0 = random",
    },

    enhanceLabel: {
        text: "Enhance",
    },

    logoLabel: {
        text: "Logo",
    },

    // Button states
    generatingText: {
        text: "Generating...",
    },

    generateImageButton: {
        text: "Generate Image",
    },

    generateTextButton: {
        text: "Generate Text",
    },
};
