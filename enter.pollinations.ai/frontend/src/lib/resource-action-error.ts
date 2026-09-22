/** Consistent action feedback while keeping the server's validation details. */
export function resourceActionError(
    action: "create" | "save" | "delete" | "update",
    subject: string,
    error?: unknown,
): string {
    const message = `Couldn’t ${action} ${subject}.`;
    const detail = error instanceof Error ? error.message.trim() : "";
    if (!detail || detail === message) return message;
    return detail.startsWith(`${message} `) ? detail : `${message} ${detail}`;
}
