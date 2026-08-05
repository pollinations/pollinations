const ENTER_DASHBOARD_URL = "https://enter.pollinations.ai";

const RATE_LIMIT_FALLBACK = {
    error: "Rate limit reached on the free legacy API.",
    status: 429,
    message:
        "Continue with the same models using a secret API key with no rate limits. Pay only for the Pollen you use.",
    dashboard_url: ENTER_DASHBOARD_URL,
    provided_by: "Pollinations.AI",
};

export function sendRateLimitFallback(res) {
    return res
        .set({
            "Cache-Control": "no-store",
            "X-Pollinations-Rate-Limit-Fallback": "true",
            "X-Pollinations-Dashboard": ENTER_DASHBOARD_URL,
        })
        .status(429)
        .json(RATE_LIMIT_FALLBACK);
}
