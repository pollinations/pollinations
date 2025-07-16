/**
 * Logging utilities for GPT Image requests
 * Handles both successful requests and errors with detailed context
 */
import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import debug from "debug";

// Debug loggers
const logOps = debug("pollinations:ops");
const logError = debug("pollinations:error");

/**
 * Logs prompts made to the gptimage model to a temporary file
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - Parameters for image generation
 * @param {Object} userInfo - User authentication information
 * @param {Object} contentSafetyResults - Results from Azure Content Safety analysis (optional)
 */
export async function logGptImagePrompt(
    prompt,
    safeParams,
    userInfo = {},
    contentSafetyResults = null,
) {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "gptimage_prompts.log");

        const logEntry = JSON.stringify(
            {
                timestamp,
                prompt,
                model: safeParams.model,
                size: `${safeParams.width}x${safeParams.height}`,
                image: safeParams.image,
                // Include content safety analysis results if available
                contentSafety: contentSafetyResults,
                // Include complete user info for better diagnostics
                userInfo,
            },
            null,
            2,
        );

        // Append to log file
        await fsPromises.appendFile(logFile, logEntry + ",\n");

        logOps("Logged gptimage prompt to", logFile);
    } catch (error) {
        // Non-blocking error handling for logging
        logError("Error logging gptimage prompt:", error.message);
    }
}

/**
 * Logs errors that occur during gptimage model generation
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - Parameters for image generation
 * @param {Object} userInfo - User authentication information
 * @param {Error} error - The error that occurred
 * @param {Object} contentSafetyResults - Results from Azure Content Safety analysis (optional)
 */
export async function logGptImageError(
    prompt,
    safeParams,
    userInfo = {},
    error,
    contentSafetyResults = null,
) {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "gptimage_errors.log");

        // Format the log entry with timestamp, prompt, error details and relevant parameters
        // Check for image parameters to log
        const hasImageUrls =
            safeParams.imageUrls && safeParams.imageUrls.length > 0;
        const hasImageData =
            safeParams.imageData || safeParams.image || safeParams.images;

        const logEntry = JSON.stringify(
            {
                timestamp,
                prompt,
                model: safeParams.model,
                size: `${safeParams.width}x${safeParams.height}`,
                // Log if this is an image editing request
                hasImageInput: hasImageUrls || hasImageData,
                imageUrls: hasImageUrls ? safeParams.imageUrls : [],
                // Include content safety analysis results if available
                contentSafety: contentSafetyResults
                    ? {
                          safe: contentSafetyResults.safe,
                          formattedViolations:
                              contentSafetyResults.formattedViolations,
                          violations: contentSafetyResults.violations,
                      }
                    : null,
                // Include complete user info for better diagnostics
                userInfo,
                error: {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    code: error.code,
                    status: error.status || error.statusCode,
                    // Flag if error is related to content safety
                    isContentSafetyError:
                        error.message &&
                        (error.message.includes("unsafe content") ||
                            error.message.includes("rejected prompt") ||
                            error.message.includes("rejected image")),
                },
            },
            null,
            2,
        );

        // Append to log file
        await fsPromises.appendFile(logFile, logEntry + ",\n");

        logOps("Logged gptimage error to", logFile);
    } catch (logError) {
        // Non-blocking error handling for logging
        logError("Error logging gptimage error:", logError.message);
    }
}
