/**
 * Logging utilities for GPT Image requests
 * Handles both successful requests and errors with detailed context
 */

import { promises as fsPromises } from "node:fs";
import * as path from "node:path";
import debug from "debug";
import type { ImageParams } from "../params.ts";
import type { ContentSafetyResults } from "./azureContentSafety.ts";

// Debug loggers
const logOps = debug("pollinations:ops");
const logError = debug("pollinations:error");

export interface UserInfo {
    readonly userId?: string;
    readonly email?: string;
    readonly isAuthenticated?: boolean;
    readonly tier?: string;
    readonly [key: string]: unknown;
}

export interface GptImageLogEntry {
    readonly timestamp: string;
    readonly prompt: string;
    readonly model: string;
    readonly size: string;
    readonly image: string[] | null;
    readonly contentSafety: ContentSafetyResults | null;
    readonly userInfo: UserInfo;
}

export interface GptImageErrorLogEntry extends GptImageLogEntry {
    readonly hasImageInput: boolean;
    readonly imageUrls: string[];
    readonly error: {
        readonly message: string;
        readonly name: string;
        readonly stack?: string;
        readonly isContentSafetyError: boolean;
    };
}

/**
 * Logs prompts made to the gptimage model to a temporary file
 * @param prompt - The prompt for image generation
 * @param safeParams - Parameters for image generation
 * @param userInfo - User authentication information
 * @param contentSafetyResults - Results from Azure Content Safety analysis (optional)
 */
export async function logGptImagePrompt(
    prompt: string,
    safeParams: ImageParams,
    userInfo: UserInfo = {},
    contentSafetyResults: ContentSafetyResults | null = null,
): Promise<void> {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "gptimage_prompts.log");

        const logEntry: GptImageLogEntry = {
            timestamp,
            prompt,
            model: safeParams.model,
            size: `${safeParams.width}x${safeParams.height}`,
            image: safeParams.image,
            // Include content safety analysis results if available
            contentSafety: contentSafetyResults,
            // Include complete user info for better diagnostics
            userInfo,
        };

        const logEntryString = JSON.stringify(logEntry, null, 2);

        // Append to log file
        await fsPromises.appendFile(logFile, `${logEntryString}\n`);

        logOps("Logged gptimage prompt to", logFile);
    } catch (error) {
        // Non-blocking error handling for logging
        logError("Error logging gptimage prompt:", error.message);
    }
}

/**
 * Logs errors that occur during gptimage model generation
 * @param prompt - The prompt for image generation
 * @param safeParams - Parameters for image generation
 * @param userInfo - User authentication information
 * @param error - The error that occurred
 * @param contentSafetyResults - Results from Azure Content Safety analysis (optional)
 */
export async function logGptImageError(
    prompt: string,
    safeParams: ImageParams,
    userInfo: UserInfo = {},
    error: Error,
    contentSafetyResults: ContentSafetyResults | null = null,
): Promise<void> {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "gptimage_errors.log");

        // Format the log entry with timestamp, prompt, error details and relevant parameters
        const logEntry: GptImageErrorLogEntry = {
            timestamp,
            prompt,
            model: safeParams.model,
            size: `${safeParams.width}x${safeParams.height}`,
            image: safeParams.image,
            // Log if this is an image editing request
            hasImageInput: !!safeParams.image,
            imageUrls: safeParams.image ?? [],
            // Include content safety analysis results if available
            contentSafety: contentSafetyResults,
            // Include complete user info for better diagnostics
            userInfo,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack,
                // Flag if error is related to content safety
                isContentSafetyError:
                    error.message?.includes("unsafe content") ||
                    error.message?.includes("rejected prompt") ||
                    error.message?.includes("rejected image"),
            },
        };

        const logEntryString = JSON.stringify(logEntry, null, 2);

        // Append to log file
        await fsPromises.appendFile(logFile, `${logEntryString}\n`);

        logOps("Logged gptimage error to", logFile);
    } catch (error) {
        // Non-blocking error handling for logging
        logError("Error logging gptimage error:", error.message);
    }
}
