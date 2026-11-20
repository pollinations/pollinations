/**
 * Better Auth requires a fresh session (default: the session must be under 24
 * hours old) before unlinking an account. Keep that requirement, but tell the
 * user how to satisfy it instead of showing the same generic failure for every
 * error.
 */
export function discordDisconnectMessage(error: unknown): string {
    const record =
        error && typeof error === "object"
            ? (error as { code?: unknown; message?: unknown })
            : undefined;
    const code = typeof record?.code === "string" ? record.code : undefined;
    if (code === "SESSION_NOT_FRESH") {
        return "For security, sign out and back in, then disconnect Discord.";
    }
    if (code === "FAILED_TO_UNLINK_LAST_ACCOUNT") {
        return "Connect another sign-in method before disconnecting Discord.";
    }
    return typeof record?.message === "string" && record.message
        ? record.message
        : "Could not disconnect Discord.";
}
