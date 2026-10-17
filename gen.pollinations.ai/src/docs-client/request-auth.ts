export const DOCS_TOKEN_PLACEHOLDER = "YOUR_API_KEY";

// Keep credentials out of Scalar's snippets and mutable request editor.
export function authenticateDocsRequest(
    request: Request,
    apiKey: string | null,
) {
    if (
        !apiKey ||
        request.headers.get("Authorization") !==
            `Bearer ${DOCS_TOKEN_PLACEHOLDER}`
    ) {
        return;
    }
    const origin = new URL(request.url).origin;
    if (
        ![
            "https://gen.pollinations.ai",
            "https://enter.pollinations.ai",
            "https://media.pollinations.ai",
        ].includes(origin)
    ) {
        throw new Error(
            "The docs connection only authenticates Pollinations APIs.",
        );
    }
    request.headers.set("Authorization", `Bearer ${apiKey}`);
}
