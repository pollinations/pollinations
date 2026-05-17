import { getImageEnv } from "../env.ts";

const CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"] as const;
const SEVERITY_THRESHOLD = 4;

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

function getConfig() {
    const endpoint = getImageEnv("AZURE_CONTENT_SAFETY_ENDPOINT");
    const apiKey = getImageEnv("AZURE_CONTENT_SAFETY_API_KEY");
    if (!endpoint || !apiKey) return null;
    return { endpoint: endpoint.replace(/\/$/, ""), apiKey };
}

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
    const cfg = getConfig();
    if (!cfg) return SAFE_RESULT;

    try {
        const response = await fetch(
            `${cfg.endpoint}${path}?api-version=2023-10-01`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": cfg.apiKey,
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

export const config = {
    SEVERITY_THRESHOLD,
    CATEGORIES,
    get isConfigured() {
        return !!getConfig();
    },
};
