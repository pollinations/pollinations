import type {
    ContentFilterResult,
    ContentFilterSeverity,
} from "@/schemas/openai.ts";

const severityOrder: Record<ContentFilterSeverity, number> = {
    safe: 0,
    low: 1,
    medium: 2,
    high: 3,
};

function getMostSevere(
    a: ContentFilterSeverity,
    b: ContentFilterSeverity,
): ContentFilterSeverity {
    return severityOrder[a] > severityOrder[b] ? a : b;
}

export function mergeContentFilterResults(
    results: ContentFilterResult[],
): ContentFilterResult {
    if (results.length === 0) {
        return {};
    }

    const merged: ContentFilterResult = {};

    // Merge severity-based categories
    const severityCategories = [
        "hate",
        "self_harm",
        "sexual",
        "violence",
    ] as const;

    for (const category of severityCategories) {
        const categoryResults = results
            .map((r) => r[category])
            .filter((c): c is NonNullable<typeof c> => c !== undefined);

        if (categoryResults.length > 0) {
            const mostSevere = categoryResults.reduce((acc, curr) => ({
                filtered: acc.filtered || curr.filtered,
                severity: getMostSevere(acc.severity, curr.severity),
            }));
            merged[category] = mostSevere;
        }
    }

    // Merge boolean-based categories
    const booleanCategories = [
        "jailbreak",
        "protected_material_text",
        "protected_material_code",
    ] as const;

    for (const category of booleanCategories) {
        const categoryResults = results
            .map((r) => r[category])
            .filter((c): c is NonNullable<typeof c> => c !== undefined);

        if (categoryResults.length > 0) {
            merged[category] = {
                filtered: categoryResults.some((c) => c.filtered),
                detected: categoryResults.some((c) => c.detected),
            };
        }
    }

    return merged;
}
