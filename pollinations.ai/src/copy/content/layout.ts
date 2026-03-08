// Layout content configuration (header, footer, navigation)

// Keys that should never be translated (email addresses, legal names)
export const LAYOUT_NO_TRANSLATE = new Set([
    "contactEmail", // email address — must stay as-is
    "footerBranding", // legal entity name — must stay as-is
]);

export const LAYOUT = {
    // Navigation tabs
    navHello: "Hello",
    navPlay: "Play",
    navDocs: "Docs",
    navApps: "Apps",
    navCommunity: "Community",

    // Header
    enterButton: "Enter",
    changeThemeTooltip: "Change theme",
    contactEmail: "hello@pollinations.ai",
    loadingBuildDiary: "Loading build diary...",
    loadingEllipsis: "...",
    weekLabel: "Week",

    // Footer
    termsLink: "Terms",
    privacyLink: "Privacy",
    emailLink: "Email",
    copiedLabel: "Copied!",
    footerBranding: "Pollinations.AI © 2026 Myceli AI OÜ",
    footerTagline: "Open source AI innovation",
};
