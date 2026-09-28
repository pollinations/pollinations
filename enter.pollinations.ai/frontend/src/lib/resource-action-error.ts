// These local fallbacks add no detail beyond the contextual action message.
const genericFailures = new Set([
    "Failed to create API key",
    "Failed to save key. Please try again.",
    "Failed to save key metadata",
    "Request failed",
]);

/** Consistent action feedback while keeping the server's validation details. */
export function resourceActionError(
    action: "create" | "save" | "delete" | "update",
    subject: string,
    error?: unknown,
): string {
    const message = `Couldn’t ${action} ${subject}.`;
    const detail = error instanceof Error ? error.message.trim() : "";
    if (!detail || detail === message || genericFailures.has(detail))
        return message;
    return detail.startsWith(`${message} `) ? detail : `${message} ${detail}`;
}
