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
    pollenCtaTitle: "🏵️ Add Pollen to Your App",
    pollenCtaDescription:
        "Let users sign in with Pollinations. They pay for usage, you pay $0.",
    pollenCtaButton: "Learn More",

    // Badges & tooltips
    pollenBadge: "🏵️ POLLEN",
    pollenTooltip: "Sign in with Pollinations — Pollen covers usage",
    buzzBadge: "🐝 BUZZ",
    buzzTooltip: "100+ API requests in the last 24 hours",
    newBadge: "🫧 FRESH",
    newTooltip: "Recently added to the ecosystem",

    // Legend
    pollenLegendDesc: "In-app sign in with pollinations.ai",
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

// Genre filters — category-based
export const GENRE_FILTERS = [
    {
        id: "image",
        label: "🖼️ Image",
        match: (app: App) => app.category === "image",
    },
    {
        id: "chat",
        label: "💬 Chat",
        match: (app: App) => app.category === "chat",
    },
    {
        id: "build",
        label: "🛠️ Build",
        match: (app: App) => app.category === "build",
    },
    {
        id: "writing",
        label: "✍️ Write",
        match: (app: App) => app.category === "writing",
    },
    {
        id: "games",
        label: "🎮 Games",
        match: (app: App) => app.category === "games",
    },
    {
        id: "learn",
        label: "📚 Learn",
        match: (app: App) => app.category === "learn",
    },
    {
        id: "business",
        label: "💼 Business",
        match: (app: App) => app.category === "business",
    },
    {
        id: "bots",
        label: "🤖 Bots",
        match: (app: App) => app.category === "bots",
    },
    {
        id: "video_audio",
        label: "🎬 Video & Audio",
        match: (app: App) => app.category === "video_audio",
    },
];

// Badge filters — each has a distinct glow color (CSS var with RGB triplet)
export const BADGE_FILTERS = [
    {
        id: "new",
        label: "🫧 Fresh",
        match: badges.new,
        glow: "var(--dark)",
    },
    {
        id: "pollen",
        label: "🏵️ Pollen",
        match: badges.pollen,
        glow: "var(--dark)",
    },
    {
        id: "buzz",
        label: "🐝 Buzz",
        match: badges.buzz,
        glow: "var(--muted)",
    },
];

// Combined for lookup
export const ALL_FILTERS = [...GENRE_FILTERS, ...BADGE_FILTERS];
