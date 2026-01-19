/**
 * Simplified PWA asset configuration
 * Just theme colors and output directories
 */

export const APP_CONFIGS = {
    enter: {
        name: "enter.pollinations.ai",
        outputDir: "enter.pollinations.ai/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text.svg",
        themeColor: "#D1FAE4",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        seo: {
            title: "pollinations.ai - beta",
            description: "authentication and API gateway for pollinations.ai",
            url: "https://enter.pollinations.ai",
        },
    },

    pollinations: {
        name: "pollinations.ai",
        outputDir: "pollinations.ai/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text.svg",
        themeColor: "#F9FF7B",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        seo: {
            title: "pollinations.ai",
            description:
                "Generative AI APIs for developers. Integrate AI models via one simple API. Built for app creators, with sponsorship programs available.",
            url: "https://pollinations.ai",
        },
    },

    hello: {
        name: "hello.pollinations.ai",
        outputDir: "hello.pollinations.ai/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text.svg",
        themeColor: "#C7D4D6",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        seo: {
            title: "pollinations.ai - hello",
            description:
                "AI creation playground - Generate images, text & audio with open source models",
            url: "https://hello.pollinations.ai",
        },
    },

    chat: {
        name: "chat.pollinations.ai",
        outputDir: "apps/chat/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text.svg",
        themeColor: "#e7faec",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        seo: {
            title: "chat.pollinations.ai",
            description:
                "AI chat interface powered by pollinations.ai - Multi-model conversations with open source AI",
            url: "https://chat.pollinations.ai",
        },
    },
};

/**
 * Helper to resolve background color
 * Supports: 'transparent', hex colors, or {r, g, b, alpha} objects
 */
export function resolveBackground(bgConfig) {
    if (bgConfig === "transparent") {
        return { r: 0, g: 0, b: 0, alpha: 0 };
    }

    if (typeof bgConfig === "string" && bgConfig.startsWith("#")) {
        // Convert hex to RGB
        const hex = bgConfig.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b, alpha: 1 };
    }

    return bgConfig;
}
