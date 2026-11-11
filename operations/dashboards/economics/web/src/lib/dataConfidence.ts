import type { OpTransactionRow } from "../types";
import { hasReconciledTransactionEvidence } from "./documents";
import { fmtExactUsd as fmtUsd } from "./format";
import { toUsd } from "./fx";
import type { ReconciliationIssue } from "./reconciliation";
import type { unitEconomicsReport } from "./unitEconomics";

type Report = ReturnType<typeof unitEconomicsReport>;

// This measures source coverage, never the probability that a result is correct.
// Missing amounts have no defensible denominator and receive no percentage.
export function dataConfidence(
    issues: ReconciliationIssue[],
    report?: Report | null,
) {
    if (issues.some((row) => row.group === "financial")) {
        return {
            status: "Incomplete",
            detail: "Financial source checks remain open; recorded totals may change. See reconciliation for the affected amounts and months.",
        };
    }
    if (report) {
        if (!report.vendorMonths.length) {
            return {
                status: "Incomplete",
                detail: "No provider records for this period; missing data is not zero.",
            };
        }
        const { blockers, vendorMonths } = report;
        if (blockers.some((row) => row.kind !== "usage")) {
            return {
                status: "Incomplete",
                detail: "Missing source records or an unresolved usage split; coverage cannot be measured.",
            };
        }
        const cost = vendorMonths.reduce(
            (total, row) => total + Math.abs(row.providerUsageUsd ?? 0),
            0,
        );
        const unmatched = blockers.reduce(
            (total, row) => total + Math.abs(row.amountUsd ?? 0),
            0,
        );
        if (blockers.length) {
            // Floor rather than round: an outstanding gap must not display 100%.
            const percentage =
                cost > 0
                    ? `${Math.floor(Math.max(0, 1 - unmatched / cost) * 100)}% of recorded costs have usage records. `
                    : "";
            const amount = fmtUsd(unmatched);
            return {
                status: "Partial",
                detail: `${percentage}${amount} has no matching usage; ${report.provisional ? "results use recorded figures" : "results remain unknown"}.`,
            };
        }
        return {
            status: issues.length ? "Details to review" : "Complete for totals",
            detail: `Costs and usage sources are present.${issues.length ? " Other checks remain in reconciliation." : ""}`,
        };
    }
    return {
        status: issues.length ? "Needs review" : "No flagged issues",
        detail: issues.length
            ? `${issues.length} reconciliation ${issues.length === 1 ? "item" : "items"} in this period.`
            : "No issues detected by the available checks.",
    };
}

// Use the effective Bank ledger, not issue amounts: multiple issues can refer
// to the same movement. This measures recorded cash only, not missing sources.
export function unreconciledBankAmount(
    transactions: OpTransactionRow[] | undefined,
    year: string,
): number | null {
    const rows = transactions?.filter(
        (row) => row.kind === "transaction" && row.date.startsWith(`${year}-`),
    );
    if (!rows?.length) return null;
    const seen = new Set<string>();
    let amount = 0;
    for (const row of rows) {
        const key = `${row.source}|${row.entry_id}`;
        if (seen.has(key) || !Number.isFinite(row.amount)) return null;
        seen.add(key);
        if (!hasReconciledTransactionEvidence(row)) {
            try {
                amount += Math.abs(toUsd(row.amount, row.currency, row.date));
            } catch {
                // A missing conversion must not turn unknown money into zero.
                return null;
            }
        }
    }
    return amount;
}
