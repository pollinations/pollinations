export function responseError(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const { error, message } = payload as {
        error?: unknown;
        message?: unknown;
    };
    if (typeof error === "string") return error;
    if (typeof message === "string") return message;
    return fallback;
}
