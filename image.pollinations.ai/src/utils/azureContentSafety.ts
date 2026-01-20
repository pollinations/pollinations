import { AzureKeyCredential } from "@azure/core-auth";
import ContentSafetyClient, {
    isUnexpected,
} from "@azure-rest/ai-content-safety";
import "dotenv/config";

// Initialize the client with API key authentication
const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
const apiKey = process.env.AZURE_CONTENT_SAFETY_API_KEY;

if (!endpoint || !apiKey) {
    console.warn(
        "Azure Content Safety not configured - missing AZURE_CONTENT_SAFETY_ENDPOINT or AZURE_CONTENT_SAFETY_API_KEY",
    );
}

const credential = apiKey ? new AzureKeyCredential(apiKey) : null;
const client =
    endpoint && credential ? ContentSafetyClient(endpoint, credential) : null;

// Categories we check for
const CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"] as const;

// Severity levels: 0 (safe), 2 (low), 4 (medium), 6 (high)
const SEVERITY_THRESHOLD = 4; // Block medium and high severity content

export interface ContentSafetyResults {
    readonly safe: boolean;
    readonly violations: ReadonlyArray<ContentViolation>;
    readonly formattedViolations: string;
}

export type ContentViolationCategory = (typeof CATEGORIES)[number];
export type ContentViolationSeverity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ContentViolation {
    readonly category: ContentViolationCategory;
    readonly severity: ContentViolationSeverity;
}

export interface ContentSafetyFlags {
    readonly isMature: boolean;
    readonly isChild: boolean;
}

export interface ContentSafetyConfig {
    readonly SEVERITY_THRESHOLD: number;
    readonly CATEGORIES: typeof CATEGORIES;
    readonly isConfigured: boolean;
}

/**
 * Analyzes text content for safety violations
 * @param {string} text - The text to analyze
 * @returns {Promise<ContentViolationResults>}
 */
export async function analyzeTextSafety(
    text: string,
): Promise<ContentSafetyResults> {
    if (!client) {
        console.warn(
            "Azure Content Safety not configured - skipping text analysis",
        );
        return {
            safe: true,
            violations: [],
            formattedViolations: "No violations detected",
        };
    }

    try {
        const analyzeTextOption = { text: text };
        const analyzeTextParameters = { body: analyzeTextOption };

        const result = await client
            .path("/text:analyze")
            .post(analyzeTextParameters);

        if (isUnexpected(result)) {
            console.error("Azure Content Safety text analysis error:", result);
            // In case of error, we'll be permissive and allow the content
            return {
                safe: true,
                violations: [],
                formattedViolations: "No violations detected",
            };
        }

        const violations = [];
        let safe = true;

        for (const analysis of result.body.categoriesAnalysis) {
            if (analysis.severity >= SEVERITY_THRESHOLD) {
                safe = false;
                violations.push({
                    category: analysis.category,
                    severity: analysis.severity,
                });
            }
        }

        // Format violations as part of the result
        const formattedViolations = formatViolations(violations);
        return { safe, violations, formattedViolations };
    } catch (error) {
        console.error("Azure Content Safety text analysis error:", error);
        // In case of error, we'll be permissive and allow the content
        return {
            safe: true,
            violations: [],
            formattedViolations: "No violations detected",
        };
    }
}

/**
 * Analyzes image content for safety violations
 * @param {Buffer|string} imageData - The image buffer or base64 string
 * @returns {Promise<ContentViolationResults>}
 */
export async function analyzeImageSafety(
    imageData: Buffer | string,
): Promise<ContentSafetyResults> {
    if (!client) {
        console.warn(
            "Azure Content Safety not configured - skipping image analysis",
        );
        return {
            safe: true,
            violations: [],
            formattedViolations: "No violations detected",
        };
    }

    try {
        // Convert buffer to base64 if needed
        const base64Image = Buffer.isBuffer(imageData)
            ? imageData.toString("base64")
            : imageData;

        const analyzeImageOption = { image: { content: base64Image } };
        const analyzeImageParameters = { body: analyzeImageOption };

        const result = await client
            .path("/image:analyze")
            .post(analyzeImageParameters);

        if (isUnexpected(result)) {
            console.error("Azure Content Safety image analysis error:", result);
            // In case of error, we'll be permissive and allow the content
            return {
                safe: true,
                violations: [],
                formattedViolations: "No violations detected",
            };
        }

        const violations = [];
        let safe = true;

        for (const analysis of result.body.categoriesAnalysis) {
            if (analysis.severity >= SEVERITY_THRESHOLD) {
                safe = false;
                violations.push({
                    category: analysis.category,
                    severity: analysis.severity,
                });
            }
        }

        // Format violations as part of the result
        const formattedViolations = formatViolations(violations);
        return { safe, violations, formattedViolations };
    } catch (error) {
        console.error("Azure Content Safety image analysis error:", error);
        // In case of error, we'll be permissive and allow the content
        return {
            safe: true,
            violations: [],
            formattedViolations: "No violations detected",
        };
    }
}

/**
 * Formats violations into a human-readable message
 * @param {Array<{category: string, severity: number}>} violations
 * @returns {string}
 */
function formatViolations(violations: ContentViolation[]): string {
    if (violations.length === 0) return "No violations detected";

    return violations
        .map((v) => `${v.category} (severity: ${v.severity})`)
        .join(", ");
}

// Export configuration for testing
export const config: ContentSafetyConfig = {
    SEVERITY_THRESHOLD,
    CATEGORIES,
    isConfigured: !!client,
};
