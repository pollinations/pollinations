const CHAT_COMPLETION_FAILURE =
    "Chat Completions provider failed to complete the response";

export function extractProviderErrorMessage(details: unknown): string | null {
    if (typeof details === "string") return details.trim() || null;
    if (!details || typeof details !== "object") return null;

    const { error, message } = details as {
        error?: { message?: unknown };
        message?: unknown;
    };
    for (const candidate of [error?.message, message]) {
        if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    return null;
}

export function chatCompletionChoiceError(
    completion: unknown,
    {
        fallback = CHAT_COMPLETION_FAILURE,
        includeUnmarkedErrors = false,
    }: { fallback?: string; includeUnmarkedErrors?: boolean } = {},
): string | undefined {
    if (!completion || typeof completion !== "object") return undefined;
    const { choices } = completion as { choices?: unknown };
    if (!Array.isArray(choices)) return undefined;
    const failed = choices.find(
        (choice) =>
            choice?.finish_reason === "error" ||
            (includeUnmarkedErrors && choice?.error),
    );
    return failed
        ? (extractProviderErrorMessage(failed.error)?.trim() ?? fallback)
        : undefined;
}
