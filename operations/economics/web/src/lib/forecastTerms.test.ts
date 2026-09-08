import { describe, expect, it } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { forecastLineRule, forecastRuleEntries } from "./forecastTerms";
import { parsePrivateConfig } from "./pipeContracts";
import { PROVIDER_REGISTRY, resolveProvider } from "./providerRegistry";

// Runway lines that are activity facts or reviewed adjustments, not vendors.
const SYNTHETIC_LINES = new Set([
    "stripe sales",
    "stripe refunds",
    "fx revaluation",
    "pre-window movements",
]);

describe("forecast terms", () => {
    it.each([
        ["vast.ai", "vast", "compute"],
        ["bedrock", "aws", "compute"],
        ["fx revaluation", "fx revaluation", "balance_sheet"],
        ["pre-window movements", "pre-window movements", "balance_sheet"],
    ])("applies a saved %s override to %s (%s)", (savedVendor, vendor, category) => {
        const override = { activeThrough: "2026-09" };
        const { forecastRules } = parsePrivateConfig({
            config: JSON.stringify({
                ...PRIVATE_CONFIG_FIXTURE,
                forecastRules: { [`${savedVendor}|${category}`]: override },
            }),
            recorded_at: "2026-09-08",
        });
        expect(forecastLineRule(vendor, category, forecastRules)).toMatchObject(
            override,
        );
    });

    it.each([
        ["vast.ai|compute", "vast|compute"],
        ["vast|compute", "vast.ai|compute"],
    ])("rejects colliding saved keys %s and %s", (first, second) => {
        expect(() =>
            parsePrivateConfig({
                config: JSON.stringify({
                    ...PRIVATE_CONFIG_FIXTURE,
                    forecastRules: {
                        [first]: { activeThrough: "2026-08" },
                        [second]: { activeThrough: "2026-09" },
                    },
                }),
                recorded_at: "2026-09-08",
            }),
        ).toThrow("Duplicate forecast rule for vast|compute");
    });

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
