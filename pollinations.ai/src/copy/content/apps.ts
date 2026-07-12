// AppsPage content configuration
import type { App } from "../../hooks/useApps";

export const APPS_PAGE = {
    pageTitle: "apps",
    pageDescription:
        "Explore 500+ apps built by the community using the pollinations.ai API",
    title: "Ecosystem",
    subtitlePrefix: "🌿 Paradise-built apps, tools, and experiments—",
    subtitleBold: "pollinations.ai-powered.",
    subtitleSuffix: " Browse, try, ship. 🚀",
    noAppsMessage: "No apps found in this category yet.",
    authorPrefix: "by",

    // CTAs
    submitCtaTitle: "Built something cool?",
    submitCtaDescription: "Get featured in the showcase and level up!",
    submitCtaButton: "Submit App",
    pollenCtaTitle: "🏵️ Add Pollen to Your App",
    pollenCtaDescription:
        "Let users sign in with their own Pollinations account.",
    pollenCtaButton: "Learn More",

    // Badges & tooltips
    pollenBadge: "🏵️ POLLEN",
    pollenTooltip: "Sign in with Pollinations — Pollen covers usage",
    buzzBadge: "🐝 BUZZ",
    buzzTooltip: "100+ API requests in the last 24 hours",
    newBadge: "🫧 FRESH",
    newTooltip: "Recently added to the ecosystem",

    // GitHub link tooltip (use {name} as placeholder, replaced at render time)
    viewOnGithub: "View {name} on GitHub",

    // Sort
    sortLabel: "Sort by",

    // Legend
    pollenLegendDesc: "In-app user sign in",
    pollenDocsLink: "</> Docs",
    buzzLegendDesc: "100+ requests / 24h",
    newLegendDesc: "Recently added",

    // Platform display labels (emoji + name shown on app cards)
    platformWeb: "🌐 Web",
    platformAndroid: "📱 Android",
    platformIos: "🍎 iOS",
    platformWindows: "🖥️ Windows",
    platformMacos: "🖥️ macOS",
    platformDesktop: "💻 Desktop",
    platformCli: "⌨️ CLI",
    platformDiscord: "💬 Discord",
    platformTelegram: "✈️ Telegram",
    platformWhatsapp: "💬 WhatsApp",
    platformLibrary: "📦 Library",
    platformBrowserExt: "🧩 Extension",
    platformRoblox: "🎮 Roblox",
    platformWordpress: "📝 WordPress",
    platformApi: "⚙️ API",
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

// Genre filters — category-based, each with a glow color cycling through palette
export const GENRE_FILTERS = [
    {
        id: "image",
        label: "🖼️ Image",
        match: (app: App) => app.category === "image",
        glow: "var(--primary-strong)",
    },
    {
        id: "chat",
        label: "💬 Chat",
        match: (app: App) => app.category === "chat",
        glow: "var(--secondary-strong)",
    },
    {
        id: "build",
        label: "🛠️ Build",
        match: (app: App) => app.category === "build",
        glow: "var(--tertiary-strong)",
    },
    {
        id: "writing",
        label: "✍️ Write",
        match: (app: App) => app.category === "writing",
        glow: "var(--accent-strong)",
    },
    {
        id: "games",
        label: "🎮 Games",
        match: (app: App) => app.category === "games",
        glow: "var(--primary-strong)",
    },
    {
        id: "learn",
        label: "📚 Learn",
        match: (app: App) => app.category === "learn",
        glow: "var(--secondary-strong)",
    },
    {
        id: "business",
        label: "💼 Business",
        match: (app: App) => app.category === "business",
        glow: "var(--tertiary-strong)",
    },
    {
        id: "bots",
        label: "🤖 Bots",
        match: (app: App) => app.category === "bots",
        glow: "var(--accent-strong)",
    },
    {
        id: "video_audio",
        label: "🎬 Video & Audio",
        match: (app: App) => app.category === "video_audio",
        glow: "var(--primary-strong)",
    },
];

// Badge filters — each has a distinct glow color (CSS var with RGB triplet)
export const BADGE_FILTERS = [
    {
        id: "new",
        label: "🫧 Fresh",
        match: badges.new,
        glow: "var(--tertiary-strong)",
    },
    {
        id: "pollen",
        label: "🏵️ Pollen",
        match: badges.pollen,
        glow: "var(--accent-strong)",
    },
    {
        id: "buzz",
        label: "🐝 Buzz",
        match: badges.buzz,
        glow: "var(--primary-strong)",
    },
];

// Combined for lookup
export const ALL_FILTERS = [...GENRE_FILTERS, ...BADGE_FILTERS];
