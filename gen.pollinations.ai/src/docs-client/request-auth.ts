// Keep credentials out of Scalar's snippets and mutable request editor.
// The docs page runs this function's source, so it must stay self-contained.
export function authenticateDocsRequest(
    request: Request,
    apiKey: string | null,
) {
    if (
        !apiKey ||
        request.headers.get("Authorization") !== "Bearer YOUR_API_KEY"
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
