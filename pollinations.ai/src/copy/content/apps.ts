// AppsPage content configuration

export const APPS_PAGE = {
    title: {
        text: "Ecosystem",
        translate: true,
    },

    subtitle: {
        text: "Paradise-built apps, tools, and experiments—pollinations.ai-powered. Browse, try, ship.",
        transform: true,
    },

    // Submit app CTA
    submitCtaTitle: {
        text: "🚀 Built something cool?",
        translate: true,
    },
    submitCtaDescription: {
        text: "Get featured in the showcase and earn Pollen!",
        translate: true,
    },
    submitCtaButton: {
        text: "✨ Submit App",
        translate: true,
    },
    noAppsMessage: {
        text: "No apps found in this category yet.",
        translate: true,
    },
};

// Category mapping for display
export const CATEGORIES = [
    { id: "creative", label: "Creative" },
    { id: "chat", label: "Chat" },
    { id: "games", label: "Games" },
    { id: "hackandbuild", label: "Dev Tools" },
    { id: "vibecoding", label: "Vibes" },
    { id: "socialbots", label: "Social Bots" },
    { id: "learn", label: "Learn" },
    { id: "featured", label: "Featured" },
];

// Path to APPS.md on GitHub (fetched at runtime)
export const appsFilePath =
    "https://raw.githubusercontent.com/pollinations/pollinations/main/apps/APPS.md";

// Translation config for app fields
export const APPS_TRANSLATION_CONFIG = {
    description: "translate",
} as const;
