import debug from "debug";

const log = debug("app:errors");

/**
 * Known error types that should cause process exit
 */
export class FatalTokenError extends Error {
    constructor(context: string) {
        super(`Token error in ${context}`);
        this.name = "FatalTokenError";
    }
}

export class NetworkTimeoutError extends Error {
    constructor(timeout: number) {
        super(`Request timed out after ${timeout}ms`);
        this.name = "NetworkTimeoutError";
    }
}

/**
 * Check if an error indicates invalid/missing Discord token
 */
export function isFatalTokenError(error: any): boolean {
    return (
        error?.message?.includes("Expected token to be set for this request") ||
        error?.code === "TOKEN_INVALID"
    );
}

/**
 * Handle Discord API errors - throws FatalTokenError for token issues, logs others
 */
export function handleDiscordError(
    error: any,
    context: string,
    botName: string,
): void {
    if (isFatalTokenError(error)) {
        log(
            "FATAL: Token error in %s for %s. Exiting process.",
            context,
            botName,
        );
        throw new FatalTokenError(`${context} for ${botName}`);
    }

    log("Discord API error in %s for %s: %O", context, botName, error);
}
