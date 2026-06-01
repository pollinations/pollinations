/**
 * Simplified PWA asset configuration
 * Just theme colors and output directories
 */

export const APP_CONFIGS = {
    // enter migrated to tools/brand-assets (sources the logo from @pollinations_ai/ui).
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
