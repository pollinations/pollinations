import debug from "debug";
import type { ImageParams } from "../params.ts";

const logOps = debug("pollinations:ops");
const logError = debug("pollinations:error");

export async function logGptImagePrompt(
    prompt: string,
    safeParams: ImageParams,
    userInfo: object = {},
    contentSafetyResults: object = null,
): Promise<void> {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            prompt,
            model: safeParams.model,
            size: `${safeParams.width}x${safeParams.height}`,
            image: safeParams.image,
            contentSafety: contentSafetyResults,
            userInfo,
        };
        logOps("gptimage prompt: %O", entry);
    } catch (error) {
        logError("Error logging gptimage prompt:", error.message);
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
        const entry = {
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
        };
        logOps("gptimage error: %O", entry);
    } catch (error) {
        logError("Error logging gptimage error:", error.message);
    }
}
