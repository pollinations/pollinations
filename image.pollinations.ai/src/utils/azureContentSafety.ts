import { AzureKeyCredential } from "@azure/core-auth";
import ContentSafetyClient, {
    isUnexpected,
} from "@azure-rest/ai-content-safety";
import "dotenv/config";

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

const CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"] as const;
const SEVERITY_THRESHOLD = 4; // Block medium (4) and high (6) severity content

export type ContentSafetyResults = {
    safe: boolean;
    violations: ContentViolation[];
    formattedViolations: string;
};

export type ContentViolationCategory = (typeof CATEGORIES)[number];
export type ContentViolationSeverity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ContentViolation = {
    category: ContentViolationCategory;
    severity: ContentViolationSeverity;
};

export type ContentSafetyFlags = {
    isMature: boolean;
    isChild: boolean;
};

const SAFE_RESULT: ContentSafetyResults = {
    safe: true,
    violations: [],
    formattedViolations: "No violations detected",
};

function buildResultFromCategories(
    categoriesAnalysis: Array<{ category: string; severity?: number }>,
): ContentSafetyResults {
    const violations: ContentViolation[] = [];
    let safe = true;

    for (const analysis of categoriesAnalysis) {
        const severity = analysis.severity ?? 0;
        if (severity >= SEVERITY_THRESHOLD) {
            safe = false;
            violations.push({
                category: analysis.category as ContentViolationCategory,
                severity: severity as ContentViolationSeverity,
            });
        }
    }

    return {
        safe,
        violations,
        formattedViolations: formatViolations(violations),
    };
}

export async function analyzeTextSafety(
    text: string,
): Promise<ContentSafetyResults> {
    if (!client) {
        console.warn(
            "Azure Content Safety not configured - skipping text analysis",
        );
        return SAFE_RESULT;
    }

    try {
        const result = await client
            .path("/text:analyze")
            .post({ body: { text } });

        if (isUnexpected(result)) {
            console.error("Azure Content Safety text analysis error:", result);
            return SAFE_RESULT;
        }

        return buildResultFromCategories(result.body.categoriesAnalysis);
    } catch (error) {
        console.error("Azure Content Safety text analysis error:", error);
        return SAFE_RESULT;
    }
}

export async function analyzeImageSafety(
    imageData: Buffer | string,
): Promise<ContentSafetyResults> {
    if (!client) {
        console.warn(
            "Azure Content Safety not configured - skipping image analysis",
        );
        return SAFE_RESULT;
    }

    try {
        const content = Buffer.isBuffer(imageData)
            ? imageData.toString("base64")
            : imageData;

        const result = await client
            .path("/image:analyze")
            .post({ body: { image: { content } } });

        if (isUnexpected(result)) {
            console.error("Azure Content Safety image analysis error:", result);
            return SAFE_RESULT;
        }

        return buildResultFromCategories(result.body.categoriesAnalysis);
    } catch (error) {
        console.error("Azure Content Safety image analysis error:", error);
        return SAFE_RESULT;
    }
}

function formatViolations(violations: ContentViolation[]): string {
    if (violations.length === 0) return "No violations detected";

    return violations
        .map((v) => `${v.category} (severity: ${v.severity})`)
        .join(", ");
}

export const config = {
    SEVERITY_THRESHOLD,
    CATEGORIES,
    isConfigured: !!client,
};
