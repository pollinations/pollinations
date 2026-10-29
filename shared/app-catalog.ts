/** Community catalog categories and platforms, shared by the site and dashboard. */
export const APP_CATEGORIES = [
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
export type AppCategory = (typeof APP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AppCategory, string> = {
    image: "Image",
    chat: "Chat",
    build: "Build",
    writing: "Writing",
    games: "Games",
    learn: "Learn",
    business: "Business",
    bots: "Bots",
    video_audio: "Video & audio",
};

export const APP_PLATFORMS = [
    "web",
    "android",
    "ios",
    "windows",
    "macos",
    "desktop",
    "cli",
    "discord",
    "telegram",
    "whatsapp",
    "library",
    "browser-ext",
    "roblox",
    "wordpress",
    "api",
] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<AppPlatform, string> = {
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
    "browser-ext": "Browser extension",
    roblox: "Roblox",
    wordpress: "WordPress",
    api: "API",
};
