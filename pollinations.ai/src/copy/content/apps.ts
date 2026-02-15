// AppsPage content configuration

export const APPS_PAGE = {
    title: "Ecosystem",

    subtitle:
        "Paradise-built apps, tools, and experiments—pollinations.ai-powered. Browse, try, ship.",

    // Submit app CTA
    submitCtaTitle: "Built something cool?",
    submitCtaDescription: "Get featured in the showcase and earn Pollen!",
    submitCtaButton: "Submit App",

    // BYOP CTA
    byopCtaTitle: "🌸 Add Pollen to Your App",
    byopCtaDescription:
        "Let users sign in with Pollinations. They pay for usage, you pay $0.",
    byopCtaButton: "Learn More",

    noAppsMessage: "No apps found in this category yet.",

    // Badges
    byopBadge: "🌸 Pollen",
    trendingBadge: "TRENDING",

    // Tooltips
    byopTooltip: "Sign in with your Pollinations account — your Pollen balance covers usage",
    trendingTooltipSuffix: "requests in 24h",

    // Card labels
    authorPrefix: "by",

    // Filter labels
    byopFilterLabel: "🌸 Pollen",
    newFilterLabel: "New",

    // Legend
    pollenLegend: "🌸 Pollen",
    pollenLegendDesc: "Sign in with Pollinations",
    pollenDevLink: "</> Dev docs",
};

// Category mapping for display
// IDs must match APPS.md Category column values (lowercased)
export const CATEGORIES = [
    { id: "creative", label: "Creative" },
    { id: "chat", label: "Chat" },
    { id: "games", label: "Games" },
    { id: "dev_tools", label: "Dev Tools" },
    { id: "vibes", label: "Vibes" },
    { id: "social_bots", label: "Social Bots" },
    { id: "learn", label: "Learn" },
];
