import { vi } from "vitest";

export function mockImageProviderFetch() {
    const providerFetch = vi.fn<typeof fetch>();
    vi.stubGlobal(
        "fetch",
        (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : input);
            if (
                url.hostname ===
                    "myceli-prod-eastus.cognitiveservices.azure.com" &&
                url.pathname.startsWith("/contentsafety/")
            ) {
                return Promise.resolve(
                    Response.json({ categoriesAnalysis: [] }),
                );
            }
            return providerFetch(input, init);
        },
    );
    return providerFetch;
}
