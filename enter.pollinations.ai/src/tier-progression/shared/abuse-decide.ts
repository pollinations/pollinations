import {
    type AbuseLedgerRow,
    nowIso,
    parseSemicolonList,
} from "./abuse-ledger.ts";

export type DecideSummary = {
    manualCount: number;
    incompleteCount: number;
    paidSkipCount: number;
    sharedIpBlockCount: number;
    hammeringCount: number;
    sharedIpReviewCount: number;
    sharedSubnetReviewCount: number;
    llmCarryCount: number;
};

export function applyDowngradeDecisions(
    rows: AbuseLedgerRow[],
    decidedAt = nowIso(),
): DecideSummary {
    const flaggedUnpaidSet = new Set(
        rows
            .filter(
                (row) =>
                    row.llm_status === "scored" &&
                    (row.llm_action === "block" ||
                        row.llm_action === "review") &&
                    row.has_paid_purchase !== "1",
            )
            .map((row) => row.id),
    );

    const summary: DecideSummary = {
        manualCount: 0,
        incompleteCount: 0,
        paidSkipCount: 0,
        sharedIpBlockCount: 0,
        hammeringCount: 0,
        sharedIpReviewCount: 0,
        sharedSubnetReviewCount: 0,
        llmCarryCount: 0,
    };

    for (const row of rows) {
        const manualAction = row.manual_action.trim();
        if (manualAction) {
            row.downgrade_action = manualAction;
            row.downgrade_reason = "manual";
            row.decided_at = decidedAt;
            summary.manualCount++;
            continue;
        }

        const hasRequiredEvidence =
            row.llm_status === "scored" &&
            Boolean(row.purchase_checked_at) &&
            Boolean(row.usage_checked_at) &&
            Boolean(row.ip_checked_at);

        if (!hasRequiredEvidence) {
            row.downgrade_action = "";
            row.downgrade_reason = "";
            row.decided_at = "";
            summary.incompleteCount++;
            continue;
        }

        const flaggedIpPeerCount = parseSemicolonList(
            row.ip_hash_peer_ids_in_run,
        ).filter((peerId) => flaggedUnpaidSet.has(peerId)).length;
        const flaggedSubnetPeerCount = parseSemicolonList(
            row.subnet_peer_ids_in_run,
        ).filter((peerId) => flaggedUnpaidSet.has(peerId)).length;
        const requestCount = Number.parseInt(row.request_count, 10) || 0;
        const errorRatePct = Number.parseFloat(row.error_rate_pct) || 0;

        if (row.has_paid_purchase === "1") {
            row.downgrade_action = "skip";
            row.downgrade_reason = "paid_purchase";
            row.decided_at = decidedAt;
            summary.paidSkipCount++;
        } else if (row.llm_action === "review" && flaggedIpPeerCount >= 2) {
            row.downgrade_action = "block";
            row.downgrade_reason = "shared_ip";
            row.decided_at = decidedAt;
            summary.sharedIpBlockCount++;
        } else if (
            row.llm_action === "review" &&
            errorRatePct > 80 &&
            requestCount > 20
        ) {
            row.downgrade_action = "block";
            row.downgrade_reason = "hammering";
            row.decided_at = decidedAt;
            summary.hammeringCount++;
        } else if (row.llm_action === "ok" && flaggedIpPeerCount >= 2) {
            row.downgrade_action = "review";
            row.downgrade_reason = "shared_ip";
            row.decided_at = decidedAt;
            summary.sharedIpReviewCount++;
        } else if (row.llm_action === "ok" && flaggedSubnetPeerCount >= 3) {
            row.downgrade_action = "review";
            row.downgrade_reason = "shared_subnet";
            row.decided_at = decidedAt;
            summary.sharedSubnetReviewCount++;
        } else {
            row.downgrade_action = row.llm_action;
            row.downgrade_reason = row.llm_action ? "llm" : "";
            row.decided_at = row.llm_action ? decidedAt : "";
            summary.llmCarryCount++;
        }
    }

    return summary;
}
