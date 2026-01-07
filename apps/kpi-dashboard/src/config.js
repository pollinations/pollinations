export const CONFIG = {
    // Tinybird
    TINYBIRD_API:
        import.meta.env.VITE_TINYBIRD_API || "https://api.tinybird.co",
    TINYBIRD_TOKEN: import.meta.env.VITE_TINYBIRD_TOKEN || "",

    // Cloudflare D1
    CF_API_TOKEN: import.meta.env.VITE_CF_API_TOKEN || "",
    CF_ACCOUNT_ID:
        import.meta.env.VITE_CF_ACCOUNT_ID ||
        "efdcb0933eaac64f27c0b295039b28f2",
    CF_D1_DATABASE_ID:
        import.meta.env.VITE_CF_D1_DATABASE_ID ||
        "f9cf0f09-b7aa-4cd3-8f9d-fa50c97ff1f3",

    // Polar
    POLAR_API: import.meta.env.VITE_POLAR_API || "https://api.polar.sh",
    POLAR_TOKEN: import.meta.env.VITE_POLAR_ACCESS_TOKEN || "",

    // GitHub
    GITHUB_TOKEN: import.meta.env.VITE_GITHUB_TOKEN || "",
    GITHUB_REPO: "pollinations/pollinations",
};
