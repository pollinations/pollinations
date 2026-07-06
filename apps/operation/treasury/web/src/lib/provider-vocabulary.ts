import providerAliases from "../../../../forager/config/provider_aliases.json";
import type { Data, RunRow } from "../types";

export const PROVIDER_SLUGS = Object.keys(providerAliases).sort((a, b) =>
    a.localeCompare(b),
);

export const PROVIDER_OPTIONS = ["all", ...PROVIDER_SLUGS];

const PROVIDER_SET = new Set(PROVIDER_SLUGS);

export type ProviderVocabularyIssue = {
    source: string;
    provider: string;
    detail: string;
};

function addIssue(
    issues: ProviderVocabularyIssue[],
    seen: Set<string>,
    source: string,
    provider: string,
) {
    const value = provider.trim();
    if (!value || PROVIDER_SET.has(value)) return;

    const key = `${source}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
        source,
        provider: value,
        detail: `${source}: unknown provider "${value}" - add an alias or canonical provider in provider_aliases.json`,
    });
}

export function findProviderVocabularyIssues(
    data: Pick<Data, "transactions" | "meterMonthly" | "usageMonthly">,
): ProviderVocabularyIssue[] {
    const issues: ProviderVocabularyIssue[] = [];
    const seen = new Set<string>();

    for (const row of data.transactions) {
        addIssue(issues, seen, "transactions", row.provider);
    }
    for (const row of data.meterMonthly) {
        addIssue(issues, seen, "meter_monthly", row.provider);
    }
    for (const row of data.usageMonthly) {
        addIssue(issues, seen, "usage_monthly", row.provider);
    }

    return issues.sort(
        (a, b) =>
            a.source.localeCompare(b.source) ||
            a.provider.localeCompare(b.provider),
    );
}

export function providerVocabularyRunIssues(
    runs: RunRow[],
): ProviderVocabularyIssue[] {
    const latest = runs[0];
    if (!latest) return [];

    const issues: ProviderVocabularyIssue[] = [];
    try {
        const statuses = JSON.parse(latest.statuses) as Record<string, unknown>;
        for (const [key, value] of Object.entries(statuses)) {
            const text = String(value);
            if (
                !key.includes("provider") &&
                !text.includes("unknown provider")
            ) {
                continue;
            }
            if (!text.includes("unknown provider")) continue;
            issues.push({
                source: key,
                provider: "",
                detail: `${key}: ${text}`,
            });
        }
    } catch (caught) {
        return [
            {
                source: "ingest_runs",
                provider: "",
                detail: `ingest_runs: latest statuses is not valid JSON (${caught instanceof Error ? caught.message : String(caught)})`,
            },
        ];
    }

    return issues;
}
