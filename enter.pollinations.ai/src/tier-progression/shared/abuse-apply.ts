import type { AbuseLedgerRow } from "./abuse-ledger.ts";

export function selectApplyCandidates(
    rows: AbuseLedgerRow[],
    {
        runId,
        cohort,
        fromTier,
        max = Number.MAX_SAFE_INTEGER,
    }: {
        runId: string;
        cohort?: string;
        fromTier: string;
        max?: number;
    },
): AbuseLedgerRow[] {
    const candidates = rows.filter(
        (row) =>
            row.run_id === runId &&
            (!cohort || row.cohort === cohort) &&
            row.downgrade_action === "block" &&
            row.tier === fromTier,
    );

    return max < candidates.length ? candidates.slice(0, max) : candidates;
}
