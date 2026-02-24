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
        id: "image_gen",
        label: "🖼️ Image Gen",
        tooltip: "Prompt-to-image tools and model playgrounds",
        match: (app: App) => app.category === "image_gen",
    },
    {
        id: "ai_studio",
        label: "🎨 AI Studio",
        tooltip: "Chat + images + audio + video in one app",
        match: (app: App) => app.category === "ai_studio",
    },
    {
        id: "dev_tools",
        label: "🛠️ Dev Tools",
        tooltip: "CLIs, IDE plugins, dashboards, and utilities",
        match: (app: App) => app.category === "dev_tools",
    },
    {
        id: "integrations",
        label: "📦 Integrations",
        tooltip: "SDKs, libraries, MCP servers, and plugins",
        match: (app: App) => app.category === "integrations",
    },
    {
        id: "chat",
        label: "💬 Chat",
        tooltip: "Text chat UIs and AI assistants",
        match: (app: App) => app.category === "chat",
    },
    {
        id: "design",
        label: "🪄 Design",
        tooltip: "Stickers, avatars, wallpapers, and themed visuals",
        match: (app: App) => app.category === "design",
    },
    {
        id: "content",
        label: "✍️ Content",
        tooltip: "Writing, social media, thumbnails, and slides",
        match: (app: App) => app.category === "content",
    },
    {
        id: "education",
        label: "📚 Education",
        tooltip: "Tutoring, language learning, and study tools",
        match: (app: App) => app.category === "education",
    },
    {
        id: "gaming",
        label: "🎮 Gaming",
        tooltip: "AI games, interactive fiction, and Roblox worlds",
        match: (app: App) => app.category === "gaming",
    },
    {
        id: "bots",
        label: "🤖 Bots",
        tooltip: "Discord, Telegram, and WhatsApp bots",
        match: (app: App) => app.category === "bots",
    },
    {
        id: "storytelling",
        label: "📖 Storytelling",
        tooltip: "Illustrated stories, kids books, and narrative AI",
        match: (app: App) => app.category === "storytelling",
    },
    {
        id: "audio_video",
        label: "🎬 Audio & Video",
        tooltip: "Video generators, music tools, and TTS",
        match: (app: App) => app.category === "audio_video",
    },
    {
        id: "vibe_coding",
        label: "✨ Vibe Coding",
        tooltip: "Describe it → build it, no code needed",
        match: (app: App) => app.category === "vibe_coding",
    },
    {
        id: "business",
        label: "💼 Business",
        tooltip: "E-commerce, finance, legal, and productivity",
        match: (app: App) => app.category === "business",
    },
    {
        id: "lifestyle",
        label: "🌿 Lifestyle",
        tooltip: "Health, fitness, companions, and wellbeing",
        match: (app: App) => app.category === "lifestyle",
    },
];

// Badge filters — each has a distinct glow color (CSS var with RGB triplet)
export const BADGE_FILTERS = [
    {
        id: "new",
        label: "🫧 Fresh",
        match: badges.new,
        glow: "var(--text-brand)",
    },
    {
        id: "pollen",
        label: "🏵️ Pollen",
        match: badges.pollen,
        glow: "var(--text-highlight)",
    },
    {
        id: "buzz",
        label: "🐝 Buzz",
        match: badges.buzz,
        glow: "var(--text-accent)",
    },
];

// Combined for lookup
export const ALL_FILTERS = [...GENRE_FILTERS, ...BADGE_FILTERS];
