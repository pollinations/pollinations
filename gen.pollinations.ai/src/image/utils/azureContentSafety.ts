import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { AuthResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { logGptImageError, logGptImagePrompt } from "./gptImageLogger.ts";

const logError = debug("pollinations:error");

const CONTENT_SAFETY_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com";
const CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"] as const;
const SEVERITY_THRESHOLD = 4;

type ContentSafetyResults = {
    safe: boolean;
    violations: ContentViolation[];
    formattedViolations: string;
};

type ContentViolationCategory = (typeof CATEGORIES)[number];
type ContentViolationSeverity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ContentViolation = {
    category: ContentViolationCategory;
    severity: ContentViolationSeverity;
};

const SAFE_RESULT: ContentSafetyResults = {
    safe: true,
    violations: [],
    formattedViolations: "No violations detected",
};

function formatViolations(violations: ContentViolation[]): string {
    if (violations.length === 0) return "No violations detected";
    return violations
        .map(
            (violation) =>
                `${violation.category} (severity: ${violation.severity})`,
        )
        .join(", ");
}

function buildResultFromCategories(
    categoriesAnalysis: Array<{ category: string; severity?: number }>,
): ContentSafetyResults {
    const violations: ContentViolation[] = [];

    for (const analysis of categoriesAnalysis) {
        const severity = analysis.severity ?? 0;
        if (severity >= SEVERITY_THRESHOLD) {
            violations.push({
                category: analysis.category as ContentViolationCategory,
                severity: severity as ContentViolationSeverity,
            });
        }
    }

    return {
        safe: violations.length === 0,
        violations,
        formattedViolations: formatViolations(violations),
    };
}

async function analyzeContent(
    path: string,
    body: object,
): Promise<ContentSafetyResults> {
    const apiKey = getImageEnv("AZURE_MYCELI_PROD_API_KEY");
    if (!apiKey) return SAFE_RESULT;

    try {
        const response = await fetch(
            `${CONTENT_SAFETY_ENDPOINT}${path}?api-version=2023-10-01`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            },
        );

        if (!response.ok) {
            console.error(
                "Azure Content Safety analysis error:",
                response.status,
                await response.text(),
            );
            return SAFE_RESULT;
        }

        const data = (await response.json()) as {
            categoriesAnalysis?: Array<{
                category: string;
                severity?: number;
            }>;
        };
        return buildResultFromCategories(data.categoriesAnalysis || []);
    } catch (error) {
        console.error("Azure Content Safety analysis error:", error);
        return SAFE_RESULT;
    }
}

export async function analyzeTextSafety(
    text: string,
): Promise<ContentSafetyResults> {
    return analyzeContent("/contentsafety/text:analyze", { text });
}

export async function analyzeImageSafety(
    imageData: Buffer | string,
): Promise<ContentSafetyResults> {
    const content = Buffer.isBuffer(imageData)
        ? imageData.toString("base64")
        : imageData;
    return analyzeContent("/contentsafety/image:analyze", {
        image: { content },
    });
}

/**
 * Checks prompt safety with Azure Content Safety, logs the result, and throws
 * an UpstreamError(400) if the prompt is unsafe.
 */
export async function requireSafePrompt(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<void> {
    const promptSafetyResult = await analyzeTextSafety(prompt);

    await logGptImagePrompt(prompt, safeParams, userInfo, promptSafetyResult);

    if (!promptSafetyResult.safe) {
        const errorMessage = `Prompt contains unsafe content: ${promptSafetyResult.formattedViolations}`;
        logError("Azure Content Safety rejected prompt:", errorMessage);

        const error = UpstreamError.fromProvider(400, {
            message: errorMessage,
        });
        await logGptImageError(
            prompt,
            safeParams,
            userInfo,
            error,
            promptSafetyResult,
        );
        throw error;
    }
}
