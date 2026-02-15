// AppsPage content configuration
import type { App } from "../../hooks/useApps";

export const APPS_PAGE = {
    title: "Ecosystem",
    subtitle:
        "Paradise-built apps, tools, and experiments—pollinations.ai-powered. Browse, try, ship.",
    noAppsMessage: "No apps found in this category yet.",
    authorPrefix: "by",

    // CTAs
    submitCtaTitle: "Built something cool?",
    submitCtaDescription: "Get featured in the showcase and earn Pollen!",
    submitCtaButton: "Submit App",
    pollenCtaTitle: "🌸 Add Pollen to Your App",
    pollenCtaDescription:
        "Let users sign in with Pollinations. They pay for usage, you pay $0.",
    pollenCtaButton: "Learn More",

    // Badges & tooltips
    pollenBadge: "🌸 Pollen",
    pollenTooltip:
        "Sign in with your Pollinations account — your Pollen balance covers usage",
    buzzBadge: "🐝 BUZZ",
    buzzTooltip: "100+ API requests in the last 24 hours",
    newBadge: "🆕 NEW",
    newTooltip: "Recently added to the ecosystem",

    // Legend
    pollenLegendDesc: "Sign in with Pollinations",
    pollenDocsLink: "</> Docs",
    buzzLegendDesc: "100+ requests / 24h",
    newLegendDesc: "Recently added",
};

// Badge predicates — reused for both badges on cards and filter logic
const THIRTY_DAYS = 30 * 86400000;
export const badges = {
    new: (app: App) =>
        !!app.approvedDate &&
        new Date(app.approvedDate) >= new Date(Date.now() - THIRTY_DAYS),
    pollen: (app: App) => app.byop,
    buzz: (app: App) => app.requests24h >= 100,
};

// Filters — each has a label and a match function
// Category filters match on app.category, special filters use badge predicates
export const FILTERS = [
    { id: "new", label: "🆕 New", match: badges.new },
    { id: "pollen", label: "🌸 Pollen", match: badges.pollen },
    {
        id: "creative",
        label: "🎨 Creative",
        match: (app: App) => app.category === "creative",
    },
    {
        id: "chat",
        label: "💬 Chat",
        match: (app: App) => app.category === "chat",
    },
    {
        id: "games",
        label: "🎲 Games",
        match: (app: App) => app.category === "games",
    },
    {
        id: "dev_tools",
        label: "🛠️ Dev Tools",
        match: (app: App) => app.category === "dev_tools",
    },
    {
        id: "vibes",
        label: "✨ Vibes",
        match: (app: App) => app.category === "vibes",
    },
    {
        id: "social_bots",
        label: "🤖 Social Bots",
        match: (app: App) => app.category === "social_bots",
    },
    {
        id: "learn",
        label: "📚 Learn",
        match: (app: App) => app.category === "learn",
    },
];
