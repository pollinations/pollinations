/**
 * Simplified PWA asset configuration
 * Just theme colors and output directories
 */

export const APP_CONFIGS = {
    enter: {
        name: "enter.pollinations.ai",
        outputDir: "enter.pollinations.ai/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text-black.svg",
        themeColor: "#D1FAE4",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        iconColor: "#D1FAE4",
        seo: {
            title: "pollinations.ai - beta",
            description: "Developer console for APIs, pollen grants, and usage",
            url: "https://enter.pollinations.ai",
        },
    },

    pollinations: {
        name: "pollinations.ai",
        outputDir: "pollinations.ai/public",
        sourceSvg: "../../assets/logo.svg",
        ogSourceSvg: "../../assets/logo-text.svg",
        themeColor: "#E8F372",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        iconColor: "#E8F372",  // accent strong — lime
        seo: {
            title: "pollinations.ai",
            description:
                "Build AI apps with easy APIs, daily grants, and community support",
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
