// Public app identities; the SQL allowlist lives in weekly_official_app_usage.
export const OFFICIAL_APP_VIEWS = [
    ["all", "All"],
    ["cli", "CLI"],
    ["play", "Play / Website"],
    ["openwebui", "Open WebUI"],
    ["playground", "Playground"],
    ["build", "Build"],
    ["catgpt", "CatGPT"],
    ["catgptLegacy", "CatGPT (older key)"],
    ["sdk", "SDK Device Login"],
    ["websim", "Websim"],
    ["openclaw", "OpenClaw"],
    ["sirius", "Sirius Elevator"],
    ["wallet", "Wallet Demo"],
].map(([key, name]) => ({
    key: `officialApp_${key}`,
    name: `Official apps · ${name} requests`,
    tooltip:
        "Successful (2xx) final generation requests attributed to the selected official app key, via BYOP authorization or direct key use. All sums the listed keys, counting each request once even after fallback. Excludes internal/test, legacy and community-model traffic. Manually supplied unrelated API keys cannot be attributed; key attribution does not prove which UI was used. Historical coverage depends on recorded app attribution.",
}));
