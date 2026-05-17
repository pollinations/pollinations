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
        ogSourceSvg: "../../assets/logo-text-white.svg",
        themeColor: "#E8F372",
        backgroundColor: "#110518",
        iconBackground: "transparent",
        iconColor: "#E8F372", // accent strong — lime
        seo: {
            title: "pollinations.ai",
            description:
                "Build AI apps with easy APIs, free compute, and community support",
            url: "https://pollinations.ai",
        },
    },
};
