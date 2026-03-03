/**
 * Azure Content Safety client — Workers-compatible.
 * Uses plain fetch instead of the Azure SDK to avoid Node.js dependencies
 * and module-load-time env capture issues.
 */

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

function getConfig() {
    const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
    const apiKey = process.env.AZURE_CONTENT_SAFETY_API_KEY;
    if (!endpoint || !apiKey) return null;
    return { endpoint: endpoint.replace(/\/$/, ""), apiKey };
}

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
    const cfg = getConfig();
    if (!cfg) {
        console.warn(
            "Azure Content Safety not configured - skipping text analysis",
        );
        return SAFE_RESULT;
    }

    try {
        const response = await fetch(
            `${cfg.endpoint}/contentsafety/text:analyze?api-version=2023-10-01`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": cfg.apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ text }),
            },
        );

        if (!response.ok) {
            console.error(
                "Azure Content Safety text analysis error:",
                response.status,
                await response.text(),
            );
            return SAFE_RESULT;
        }

        const data = (await response.json()) as {
            categoriesAnalysis: Array<{ category: string; severity?: number }>;
        };
        return buildResultFromCategories(data.categoriesAnalysis);
    } catch (error) {
        console.error("Azure Content Safety text analysis error:", error);
        return SAFE_RESULT;
    }
}

export async function analyzeImageSafety(
    imageData: Buffer | string,
): Promise<ContentSafetyResults> {
    const cfg = getConfig();
    if (!cfg) {
        console.warn(
            "Azure Content Safety not configured - skipping image analysis",
        );
        return SAFE_RESULT;
    }

    try {
        const content = Buffer.isBuffer(imageData)
            ? imageData.toString("base64")
            : imageData;

        const response = await fetch(
            `${cfg.endpoint}/contentsafety/image:analyze?api-version=2023-10-01`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": cfg.apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ image: { content } }),
            },
        );

        if (!response.ok) {
            console.error(
                "Azure Content Safety image analysis error:",
                response.status,
                await response.text(),
            );
            return SAFE_RESULT;
        }

        const data = (await response.json()) as {
            categoriesAnalysis: Array<{ category: string; severity?: number }>;
        };
        return buildResultFromCategories(data.categoriesAnalysis);
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
    get isConfigured() {
        return !!getConfig();
    },
};
