/** Read the error formats emitted by Enter, Better Auth and Stripe routes. */
export function apiErrorMessage(
    payload: unknown,
    defaultMessage: string,
): string {
    if (!payload || typeof payload !== "object") return defaultMessage;
    const { error, message } = payload as {
        error?: unknown;
        message?: unknown;
    };
    if (typeof error === "string") return error;
    if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
    )
        return error.message;
    if (typeof message === "string") return message;
    return defaultMessage;
}

/** Preserve status so callers can recover from an expired session. */
export async function apiResponseError(
    response: Response,
    defaultMessage: string,
): Promise<Error> {
    return new Error(
        apiErrorMessage(
            await response.json().catch(() => null),
            defaultMessage,
        ),
        { cause: response.status },
    );
}
