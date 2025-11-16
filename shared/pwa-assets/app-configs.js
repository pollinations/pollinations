/**
 * Simplified PWA asset configuration
 * Just theme colors and output directories
 */

export const APP_CONFIGS = {
    enter: {
        name: "enter.pollinations.ai",
        outputDir: "enter.pollinations.ai/public",
        sourceSvg: "../assets/logo.svg",
        ogSourceSvg: "../assets/logo-text.svg",
        themeColor: "#5b2dd8",
        seo: {
            title: "pollinations.ai - beta",
            description: "authentication and API gateway for pollinations.ai",
            url: "https://enter.pollinations.ai",
        },
    },

    pollinations: {
        name: "pollinations.ai",
        outputDir: "pollinations.ai/public",
        sourceSvg: "../assets/logo.svg",
        ogSourceSvg: "../assets/logo-text.svg",
        themeColor: "#d6379e",
        seo: {
            title: "pollinations.ai",
            description: "Free 🐝 Open Source 🌸 Gen AI 🤖 API",
            url: "https://pollinations.ai",
        },
    },

    image: {
        name: "image.pollinations.ai",
        outputDir: "image.pollinations.ai",
        sourceSvg: "../assets/logo-text.svg",
        watermark: {
            enabled: true,
            width: 200,
            height: 31,
            preserveTransparency: true,
        },
    },

    pollinations2: {
        name: "pollinations.ai2",
        outputDir: "pollinations.ai2/public",
        sourceSvg: "../assets/logo.svg",
        ogSourceSvg: "../assets/logo-text.svg",
        themeColor: "#ff6b35",
        seo: {
            title: "pollinations.ai",
            description: "Free 🐝 Open Source 🌸 Gen AI 🤖 API",
            url: "https://pollinations.ai",
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
