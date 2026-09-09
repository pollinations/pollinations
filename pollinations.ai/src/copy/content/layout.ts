// Layout content configuration (header, footer, navigation)

// Keys that should never be translated (legal names)
export const LAYOUT_NO_TRANSLATE = new Set([
    "footerBranding", // legal entity name — must stay as-is
]);

export const LAYOUT = {
    // Navigation tabs
    navHello: "hello",
    navPlay: "play",
    navDocs: "docs",
    navApps: "apps",
    navCommunity: "community",

    // Header
    enterButton: "Enter",
    changeThemeTooltip: "Change theme",
    backToTop: "↑ Top",
    loadingBuildDiary: "Loading build diary...",
    loadingEllipsis: "...",
    weekLabel: "Week",

    // Footer
    termsLink: "Terms",
    privacyLink: "Privacy",
    refundsLink: "Refunds",
    footerBranding: "Pollinations.AI © 2026 Myceli AI OÜ",
    footerTagline: "Open source AI innovation",
};
