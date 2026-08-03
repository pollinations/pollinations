export const ATTRIBUTION_HEADERS = {
    Link: '<https://pollinations.ai>; rel="service"',
    "X-Pollinations-Logo":
        "https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/lockup-horizontal-black.svg",
    "X-Powered-By": "Pollinations.AI",
} as const;

export function addAttributionHeaders(headers: Headers): void {
    for (const [name, value] of Object.entries(ATTRIBUTION_HEADERS)) {
        headers.set(name, value);
    }
}
