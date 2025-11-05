/**
 * Logging utilities for Nano Banana (Vertex AI Gemini) requests
 * Focuses on content policy violations and user identification for moderation
 */

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import debug from "debug";
import type { ImageParams } from "../params.ts";
import type { AuthResult } from "../createAndReturnImages.ts";

// Debug loggers
const logOps = debug("pollinations:ops");
const logError = debug("pollinations:error");

/**
 * Logs all nano banana responses with complete context for moderation analysis
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - Parameters for image generation
 * @param {AuthResult} userInfo - User authentication information
 * @param {any} vertexResponse - Complete response from Vertex AI
 * @param {Error} error - Error if request failed (optional)
 * @param {boolean} isContentPolicyViolation - Whether this was blocked for content policy
 * @param {object} refusalDetails - Details about the refusal reason (optional)
 */
export async function logNanoBananaResponse(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    vertexResponse: any = null,
    error: Error = null,
    isContentPolicyViolation: boolean = false,
    refusalDetails?: {
        refusalReason: string;
        textResponse: string | null;
        finishReason: string | null;
    },
): Promise<void> {
    try {
        // Create logs directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "nanobanana_responses.log");

        // Extract key information from Vertex AI response for analysis
        let responseAnalysis = null;
        if (vertexResponse) {
            responseAnalysis = {
                hasCandidates: !!vertexResponse.candidates,
                candidatesCount: vertexResponse.candidates?.length || 0,
                finishReasons: vertexResponse.candidates?.map(c => c.finishReason) || [],
                hasUsageMetadata: !!vertexResponse.usageMetadata,
                tokenCounts: vertexResponse.usageMetadata || {},
                // Check for safety-related finish reasons
                safetyBlocked: vertexResponse.candidates?.some(c => 
                    c.finishReason === 'SAFETY' || 
                    c.finishReason === 'PROHIBITED_CONTENT' ||
                    c.finishReason === 'SPII'
                ) || false,
            };
        }

        // Determine if this is a content policy violation
        // Exclude our own administrative blocks from violation detection
        const isAdministrativeBlock = error?.message?.includes('blocked from using the nano-banana model');
        
        const isViolation = !isAdministrativeBlock && (
            isContentPolicyViolation || 
            responseAnalysis?.safetyBlocked ||
            error?.message?.includes('PROHIBITED_CONTENT') ||
            error?.message?.includes('SAFETY') ||
            error?.message?.includes('content policy') ||
            error?.message?.includes('unsafe content') ||
            // "No image data" errors are likely silent content policy blocks
            error?.message?.includes('No image data returned from Vertex AI')
        );

        const logEntry = JSON.stringify(
            {
                timestamp,
                // Mark violations for easy filtering
                isContentPolicyViolation: isViolation,
                // REFUSAL REASON DETAILS - Making this prominent for easy analysis
                refusal: refusalDetails || null,
                // User identification for moderation
                userInfo: {
                    username: userInfo?.username || 'anonymous',
                    userId: userInfo?.userId || null,
                    authenticated: userInfo?.authenticated || false,
                    authReason: userInfo?.reason || 'none',
                    // Include IP or other identifying info if available
                    debugInfo: userInfo?.debugInfo || {},
                },
                // Request details
                request: {
                    prompt: prompt.substring(0, 500), // Truncate long prompts
                    model: safeParams.model,
                    size: `${safeParams.width}x${safeParams.height}`,
                    hasReferenceImages: !!(safeParams.image && safeParams.image.length > 0),
                    referenceImageCount: safeParams.image?.length || 0,
                },
                // Response analysis
                response: responseAnalysis,
                // Error details if present
                error: error ? {
                    message: error.message,
                    name: error.name,
                    // Don't log full stack trace to keep logs manageable
                    isContentPolicyError: isViolation,
                    isBlockedUser: error.message?.includes('blocked from using the nano-banana model') || false,
                } : null,
                // Full raw response for debugging (always include for errors)
                rawResponse: error ? vertexResponse : null,
            },
            null,
            2,
        );

        // Append to log file
        await fsPromises.appendFile(logFile, `${logEntry}\n`);

        // Also log violations to a separate file for easier analysis
        // Only log actual content policy violations, not administrative blocks
        if (isViolation && !isAdministrativeBlock) {
            const violationLogFile = path.join(logDir, "nanobanana_violations.log");
            await fsPromises.appendFile(violationLogFile, `${logEntry}\n`);
            
            // Log refusal reasons to a simple text file for easy analysis
            if (refusalDetails?.refusalReason) {
                const refusalLogFile = path.join(logDir, "nanobanana_refusal_reasons.txt");
                const username = userInfo?.username || 'anonymous';
                const refusalLine = `${timestamp} | ${username} | ${refusalDetails.refusalReason}\n`;
                await fsPromises.appendFile(refusalLogFile, refusalLine);
            }
            
            logOps(`🚨 Content policy violation logged for user: ${userInfo?.username || 'anonymous'}`);
        } else if (isAdministrativeBlock) {
            logOps(`🚫 Administrative block for user: ${userInfo?.username || 'anonymous'} - not logged to violations`);
        }

        logOps("Logged nano banana response to", logFile);
    } catch (logError) {
        // Non-blocking error handling for logging
        logError("Error logging nano banana response:", logError.message);
    }
}

/**
 * Logs only nano banana errors for focused analysis
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - Parameters for image generation
 * @param {AuthResult} userInfo - User authentication information
 * @param {any} vertexResponse - Complete response from Vertex AI
 * @param {object} refusalDetails - Details about the refusal reason (optional)
 */
export async function logNanoBananaErrorsOnly(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    vertexResponse: any,
    refusalDetails?: {
        refusalReason: string;
        textResponse: string | null;
        finishReason: string | null;
    },
): Promise<void> {
    try {
        // Create logs directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");

        await fsPromises.mkdir(tempDir, { recursive: true });
        await fsPromises.mkdir(logDir, { recursive: true });

        const timestamp = new Date().toISOString();
        const logFile = path.join(logDir, "nanobanana_errors_only.log");

        // Extract key information from Vertex AI response for analysis
        let responseAnalysis = null;
        if (vertexResponse) {
            responseAnalysis = {
                hasCandidates: !!vertexResponse.candidates,
                candidatesCount: vertexResponse.candidates?.length || 0,
                finishReasons: vertexResponse.candidates?.map(c => c.finishReason) || [],
                hasUsageMetadata: !!vertexResponse.usageMetadata,
                tokenCounts: vertexResponse.usageMetadata || {},
                // Check for safety-related finish reasons
                safetyBlocked: vertexResponse.candidates?.some(c => 
                    c.finishReason === 'SAFETY' || 
                    c.finishReason === 'PROHIBITED_CONTENT' ||
                    c.finishReason === 'SPII'
                ) || false,
            };
        }

        // This is likely a content policy violation (silent block)
        // But don't assume it's a violation if we don't have response data
        const isContentPolicyViolation = responseAnalysis?.safetyBlocked || false;

        const logEntry = JSON.stringify(
            {
                timestamp,
                // Mark as likely content policy violation
                isContentPolicyViolation,
                // REFUSAL REASON DETAILS - Making this prominent for easy analysis
                refusal: refusalDetails || null,
                // User identification for moderation
                userInfo: {
                    username: userInfo?.username || 'anonymous',
                    userId: userInfo?.userId || null,
                    authenticated: userInfo?.authenticated || false,
                    authReason: userInfo?.reason || 'none',
                    // Include IP or other identifying info if available
                    debugInfo: userInfo?.debugInfo || {},
                },
                // Request details
                request: {
                    prompt: prompt.substring(0, 500), // Truncate long prompts
                    model: safeParams.model,
                    size: `${safeParams.width}x${safeParams.height}`,
                    hasReferenceImages: !!(safeParams.image && safeParams.image.length > 0),
                    referenceImageCount: safeParams.image?.length || 0,
                },
                // Response analysis
                response: responseAnalysis,
                // FULL raw response for debugging "No image data" errors
                fullVertexResponse: vertexResponse,
            },
            null,
            2,
        );

        // Append to error-only log file
        await fsPromises.appendFile(logFile, `${logEntry}\n`);

        // Also log to violations file since these are likely policy violations
        const violationLogFile = path.join(logDir, "nanobanana_violations.log");
        await fsPromises.appendFile(violationLogFile, `${logEntry}\n`);
        
        // Log refusal reasons to a simple text file for easy analysis
        if (refusalDetails?.refusalReason) {
            const refusalLogFile = path.join(logDir, "nanobanana_refusal_reasons.txt");
            const timestamp = new Date().toISOString();
            const username = userInfo?.username || 'anonymous';
            const refusalLine = `${timestamp} | ${username} | ${refusalDetails.refusalReason}\n`;
            await fsPromises.appendFile(refusalLogFile, refusalLine);
        }
        
        logOps(`🚨 "No image data" error logged for user: ${userInfo?.username || 'anonymous'} - likely content policy violation`);

    } catch (logError) {
        // Non-blocking error handling for logging
        logError("Error logging nano banana error-only:", logError.message);
    }
}

/**
 * Logs nano banana errors with focus on content policy violations
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - Parameters for image generation
 * @param {AuthResult} userInfo - User authentication information
 * @param {Error} error - The error that occurred
 * @param {any} vertexResponse - Partial response from Vertex AI if available
 * @param {object} refusalDetails - Details about the refusal reason (optional)
 */
export async function logNanoBananaError(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    error: Error,
    vertexResponse: any = null,
    refusalDetails?: {
        refusalReason: string;
        textResponse: string | null;
        finishReason: string | null;
    },
): Promise<void> {
    // Determine if this is a content policy violation
    const isContentPolicyViolation = 
        error?.message?.includes('PROHIBITED_CONTENT') ||
        error?.message?.includes('SAFETY') ||
        error?.message?.includes('content policy') ||
        error?.message?.includes('unsafe content') ||
        vertexResponse?.candidates?.some(c => 
            c.finishReason === 'SAFETY' || 
            c.finishReason === 'PROHIBITED_CONTENT' ||
            c.finishReason === 'SPII'
        );

    await logNanoBananaResponse(prompt, safeParams, userInfo, vertexResponse, error, isContentPolicyViolation, refusalDetails);
}

/**
 * Log nano banana prompts to simple text file
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - Parameters for image generation
 * @param {AuthResult} userInfo - User authentication information
 */
export async function logNanoBananaPrompt(prompt: string, safeParams: ImageParams, userInfo: AuthResult): Promise<void> {
    try {
        // Create logs directory if it doesn't exist
        const tempDir = path.join(process.cwd(), "temp");
        const logDir = path.join(tempDir, "logs");
        await fsPromises.mkdir(logDir, { recursive: true });

        const logFile = path.join(logDir, "nanobanana_prompts.txt");
        
        // Format: username, prompt - image1,image2,image3 (if any)
        const username = userInfo?.username || 'anonymous';
        const imageList = safeParams.image && safeParams.image.length > 0 
            ? ` - ${safeParams.image.join(',')}`
            : '';
        
        const logLine = `${username}, ${prompt}${imageList}\n`;
        
        // Append to simple text file
        await fsPromises.appendFile(logFile, logLine);
        
    } catch (logError) {
        // Non-blocking error handling for logging
        logError("Error logging nano banana prompt:", logError.message);
    }
}
