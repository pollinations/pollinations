import debug from "debug";
import type { ImageParams } from "../params.ts";

const logOps = debug("pollinations:ops");
const logError = debug("pollinations:error");

export async function logGptImagePrompt(
    prompt: string,
    safeParams: ImageParams,
    userInfo: object = {},
    contentSafetyResults: object | null = null,
): Promise<void> {
    try {
        logOps("gptimage prompt: %O", {
            timestamp: new Date().toISOString(),
            prompt,
            model: safeParams.model,
            size: `${safeParams.width}x${safeParams.height}`,
            image: safeParams.image,
            contentSafety: contentSafetyResults,
            userInfo,
        });
    } catch (error) {
        logError("Error logging gptimage prompt:", error);
    }
}

export async function logGptImageError(
    prompt: string,
    safeParams: ImageParams,
    userInfo = {},
    error: Error,
    contentSafetyResults: any = null,
): Promise<void> {
    try {
        logOps("gptimage error: %O", {
            timestamp: new Date().toISOString(),
            prompt,
            model: safeParams.model,
            size: `${safeParams.width}x${safeParams.height}`,
            hasImageInput: !!safeParams.image,
            imageUrls: safeParams.image ?? [],
            contentSafety: contentSafetyResults
                ? {
                      safe: contentSafetyResults.safe,
                      formattedViolations:
                          contentSafetyResults.formattedViolations,
                      violations: contentSafetyResults.violations,
                  }
                : null,
            userInfo,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack,
                isContentSafetyError:
                    error.message?.includes("unsafe content") ||
                    error.message?.includes("rejected prompt") ||
                    error.message?.includes("rejected image"),
            },
        });
    } catch (logErrorValue) {
        logError("Error logging gptimage error:", logErrorValue);
    }
}
