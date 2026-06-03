import type { ThemeName } from "@pollinations/ui";

export const APPS_SOURCE_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/production/apps/APPS.md";

export const APP_LINKS = {
    submitApp:
        "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml",
    byopDocs:
        "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md",
} as const;

export const APPS_META = {
    title: "Apps | pollinations.ai",
    description:
        "Explore 500+ apps built by the community using the pollinations.ai API",
};

export const APPS_COPY = {
    title: "Ecosystem",
    subtitlePrefix: "Paradise-built apps, tools, and experiments — ",
    subtitleBold: "pollinations.ai-powered.",
    subtitleSuffix: " Browse, try, ship.",
    submitCtaTitle: "Built something cool?",
    submitCtaDescription: "Get featured in the showcase and level up.",
    submitCtaButton: "Submit App",
    pollenCtaTitle: "Add Pollen to your app",
    pollenCtaDescription:
        "Let users sign in with their own Pollinations account.",
    pollenCtaButton: "Learn More",
    categoryLabel: "Category",
    sortLabel: "Sort by",
    showingLabel: "showing",
    ofLabel: "of",
    appsLabel: "apps",
    noAppsMessage: "No apps found in this category yet.",
    authorPrefix: "by",
    viewOnGithub: "View on GitHub",
    pollenBadge: "Pollen",
    buzzBadge: "Buzz",
    newBadge: "Fresh",
    pollenLegendDesc: "in-app user sign in",
    buzzLegendDesc: "100+ requests / 24h",
    newLegendDesc: "recently added",
};

export const CATEGORY_FILTER_IDS = [
    "image",
    "chat",
    "build",
    "writing",
    "games",
    "learn",
    "business",
    "bots",
    "video_audio",
] as const;

export type CategoryFilterId = (typeof CATEGORY_FILTER_IDS)[number];

export const DEFAULT_CATEGORY_FILTER: CategoryFilterId = "image";

export const CATEGORY_FILTERS: {
    id: CategoryFilterId;
    label: string;
    theme: ThemeName;
}[] = [
    { id: "image", label: "Image", theme: "blue" },
    { id: "chat", label: "Chat", theme: "teal" },
    { id: "build", label: "Build", theme: "violet" },
    { id: "writing", label: "Writing", theme: "pink" },
    { id: "games", label: "Games", theme: "amber" },
    { id: "learn", label: "Learn", theme: "green" },
    { id: "business", label: "Business", theme: "blue" },
    { id: "bots", label: "Bots", theme: "teal" },
    { id: "video_audio", label: "Video & audio", theme: "violet" },
];

export const BADGE_FILTER_IDS = ["new", "pollen", "buzz"] as const;

export type BadgeFilterId = (typeof BADGE_FILTER_IDS)[number];

export const DEFAULT_BADGE_FILTER: BadgeFilterId = "new";

export const BADGE_FILTERS: {
    id: BadgeFilterId;
    label: string;
    theme: ThemeName;
}[] = [
    { id: "new", label: "Fresh", theme: "violet" },
    { id: "pollen", label: "Pollen", theme: "amber" },
    { id: "buzz", label: "Buzz", theme: "green" },
];

export const PLATFORM_LABELS: Record<string, string> = {
    web: "Web",
    android: "Android",
    ios: "iOS",
    windows: "Windows",
    macos: "macOS",
    desktop: "Desktop",
    cli: "CLI",
    discord: "Discord",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    library: "Library",
    "browser-ext": "Extension",
    roblox: "Roblox",
    wordpress: "WordPress",
    api: "API",
};
