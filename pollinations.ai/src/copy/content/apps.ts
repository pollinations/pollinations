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
    byopCtaTitle: "Bring Your Own Pollen",
    byopCtaDescription:
        "Users pay for their own AI usage. You pay $0. Ship apps without API costs.",
    byopCtaButton: "Learn More",

    noAppsMessage: "No apps found in this category yet.",

    // Badges
    byopBadge: "BYOP",
    trendingBadge: "TRENDING",

    // Tooltips
    byopTooltip: "Bring Your Own Pollen — users pay for their own usage",
    trendingTooltipSuffix: "requests in 24h",

    // Card labels
    authorPrefix: "by",

    // Filter labels
    byopFilterLabel: "BYOP",
    newFilterLabel: "New",
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
