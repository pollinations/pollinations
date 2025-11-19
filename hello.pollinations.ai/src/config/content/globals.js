// Global configuration for content generation

// Global context for all AI generations
export const CONTEXT = `This text appears on pollinations.ai, an open-source generative AI platform from Berlin providing free text, image, and audio generation APIs.`;

// Style presets
export const STYLES = {
    genZ: `Write in a casual, authentic Gen Z style. Use short sentences, relatable language, avoid corporate speak. Be genuine and direct.`,

    professional: `Write in a professional, clear, and authoritative tone. Maintain elegance and precision.`,

    brutalist: `Write with bold, direct language. Heavy impact, stark contrast, no fluff. Raw and minimal.`,

    friendly: `Write in a warm, welcoming, conversational tone. Like talking to a friend.`,
};

// Default model
export const DEFAULT_MODEL = "openai";

// Shared content used across pages
export const SHARED = {
    footer: {
        copyright: "© 2025 Pollinations.ai",
    },
};
