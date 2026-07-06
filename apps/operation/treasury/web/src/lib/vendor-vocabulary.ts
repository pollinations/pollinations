import vendorAliases from "../../../../forager/config/vendor_aliases.json";
import type { Data, RunRow } from "../types";

export const VENDOR_SLUGS = Object.keys(vendorAliases).sort((a, b) =>
    a.localeCompare(b),
);

export const VENDOR_OPTIONS = ["all", ...VENDOR_SLUGS];

const VENDOR_SET = new Set(VENDOR_SLUGS);

export type VendorVocabularyIssue = {
    source: string;
    vendor: string;
    detail: string;
};

function addIssue(
    issues: VendorVocabularyIssue[],
    seen: Set<string>,
    source: string,
    vendor: string,
) {
    const value = vendor.trim();
    if (!value || VENDOR_SET.has(value)) return;

    const key = `${source}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
        source,
        vendor: value,
        detail: `${source}: unknown vendor "${value}" - add an alias or canonical vendor in vendor_aliases.json`,
    });
}

export function findVendorVocabularyIssues(
    data: Pick<Data, "transactions" | "providerMonthly" | "pollenMonthly">,
): VendorVocabularyIssue[] {
    const issues: VendorVocabularyIssue[] = [];
    const seen = new Set<string>();

    for (const row of data.transactions) {
        addIssue(issues, seen, "transactions", row.vendor);
    }
    for (const row of data.providerMonthly) {
        addIssue(issues, seen, "provider_monthly", row.vendor);
    }
    for (const row of data.pollenMonthly) {
        addIssue(issues, seen, "pollen_monthly", row.vendor);
    }

    return issues.sort(
        (a, b) =>
            a.source.localeCompare(b.source) ||
            a.vendor.localeCompare(b.vendor),
    );
}

export function vendorVocabularyRunIssues(
    runs: RunRow[],
): VendorVocabularyIssue[] {
    const latest = runs[0];
    if (!latest) return [];

    const issues: VendorVocabularyIssue[] = [];
    try {
        const statuses = JSON.parse(latest.statuses) as Record<string, unknown>;
        for (const [key, value] of Object.entries(statuses)) {
            const text = String(value);
            if (!key.includes("vendor") && !text.includes("unknown vendor")) {
                continue;
            }
            if (!text.includes("unknown vendor")) continue;
            issues.push({
                source: key,
                vendor: "",
                detail: `${key}: ${text}`,
            });
        }
    } catch (caught) {
        return [
            {
                source: "ingest_runs",
                vendor: "",
                detail: `ingest_runs: latest statuses is not valid JSON (${caught instanceof Error ? caught.message : String(caught)})`,
            },
        ];
    }

    return issues;
}
