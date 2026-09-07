import { describe, expect, it } from "vitest";
import { forecastRuleEntries } from "./forecastTerms";
import { PROVIDER_REGISTRY, resolveProvider } from "./providerRegistry";

// Runway lines that are activity facts or reviewed adjustments, not vendors.
const SYNTHETIC_LINES = new Set([
    "stripe sales",
    "stripe refunds",
    "fx revaluation",
    "pre-window movements",
]);

describe("forecast terms", () => {
    it("anchors every vendor line in the vendor registry", () => {
        const runwayLines = new Set(
            PROVIDER_REGISTRY.flatMap((provider) =>
                provider.runwayLine ? [provider.runwayLine.toLowerCase()] : [],
            ),
        );
        const problems: string[] = [];
        for (const { vendor, category } of forecastRuleEntries()) {
            if (SYNTHETIC_LINES.has(vendor) || runwayLines.has(vendor)) {
                continue;
            }
            const provider = resolveProvider(vendor);
            if (!provider) {
                problems.push(`${vendor}|${category}: no registry vendor`);
                continue;
            }
            const allowed = new Set<string>([
                provider.category,
                "balance_sheet",
                ...(provider.cashRules ?? []).map((rule) => rule.category),
                ...(provider.connector != null
                    ? ["compute", "infrastructure"]
                    : []),
            ]);
            if (!allowed.has(category)) {
                problems.push(
                    `${vendor}|${category}: ${vendor} cannot produce ${category}`,
                );
            }
        }
        expect(problems).toEqual([]);
    });
});
