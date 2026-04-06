import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { selectApplyCandidates } from "../src/tier-progression/shared/abuse-apply.ts";
import { applyDowngradeDecisions } from "../src/tier-progression/shared/abuse-decide.ts";
import {
    type AbuseLedgerRow,
    loadLedger,
    normalizeLedgerRow,
    saveLedger,
} from "../src/tier-progression/shared/abuse-ledger.ts";

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function createTempLedgerPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "abuse-ledger-test-"));
    tempDirs.push(dir);
    return join(dir, "ledger.csv");
}

function makeRow(
    values: Partial<AbuseLedgerRow> & Pick<AbuseLedgerRow, "id">,
): AbuseLedgerRow {
    return normalizeLedgerRow({
        run_id: "2026-04-05T12:00:00.000Z",
        cohort: "tier:spore",
        tier: "spore",
        email: `${values.id}@example.com`,
        created_at_ts: "1712313600",
        ...values,
    });
}

describe("abuse ledger pipeline", () => {
    test("ledger CSV round-trips quoted free-text fields", () => {
        const ledgerPath = createTempLedgerPath();
        const rows = [
            makeRow({
                id: "quoted-user",
                manual_note: 'hello, "world"\nsecond line',
            }),
        ];

        saveLedger(rows, ledgerPath);

        const loaded = loadLedger(ledgerPath);
        expect(loaded).toHaveLength(1);
        expect(loaded[0].manual_note).toBe('hello, "world"\nsecond line');
    });

    test("decide materializes actions only when evidence is complete", () => {
        const ledgerPath = createTempLedgerPath();
        const rows = [
            makeRow({
                id: "manual-skip",
                manual_action: "skip",
            }),
            makeRow({
                id: "paid-user",
                llm_status: "scored",
                llm_action: "block",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "1",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "10",
                error_rate_pct: "5",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
            }),
            makeRow({
                id: "flag-a",
                llm_status: "scored",
                llm_action: "review",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "5",
                error_rate_pct: "0",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
            }),
            makeRow({
                id: "flag-b",
                llm_status: "scored",
                llm_action: "block",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "7",
                error_rate_pct: "0",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
            }),
            makeRow({
                id: "shared-ip-review",
                llm_status: "scored",
                llm_action: "review",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "12",
                error_rate_pct: "3",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
                ip_hash_peer_ids_in_run: "flag-a;flag-b",
            }),
            makeRow({
                id: "hammering-review",
                llm_status: "scored",
                llm_action: "review",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "21",
                error_rate_pct: "95",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
            }),
            makeRow({
                id: "shared-subnet-ok",
                llm_status: "scored",
                llm_action: "ok",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
                usage_checked_at: "2026-04-05T12:05:00.000Z",
                request_count: "8",
                error_rate_pct: "0",
                ip_checked_at: "2026-04-05T12:05:00.000Z",
                subnet_peer_ids_in_run: "flag-a;flag-b;hammering-review",
            }),
            makeRow({
                id: "missing-evidence",
                llm_status: "scored",
                llm_action: "review",
                purchase_checked_at: "2026-04-05T12:05:00.000Z",
                has_paid_purchase: "0",
            }),
        ];

        saveLedger(rows, ledgerPath);

        const loaded = loadLedger(ledgerPath);
        const currentRows = loaded.filter(
            (row) => row.run_id === "2026-04-05T12:00:00.000Z",
        );
        const summary = applyDowngradeDecisions(
            currentRows,
            "2026-04-05T12:10:00.000Z",
        );
        saveLedger(loaded, ledgerPath);

        expect(summary.manualCount).toBe(1);
        expect(summary.incompleteCount).toBe(1);
        expect(summary.paidSkipCount).toBe(1);
        expect(summary.sharedIpBlockCount).toBe(1);
        expect(summary.hammeringCount).toBe(1);
        expect(summary.sharedSubnetReviewCount).toBe(1);

        const decided = new Map(
            loadLedger(ledgerPath).map((row) => [row.id, row]),
        );

        expect(decided.get("manual-skip")?.downgrade_action).toBe("skip");
        expect(decided.get("manual-skip")?.downgrade_reason).toBe("manual");

        expect(decided.get("paid-user")?.downgrade_action).toBe("skip");
        expect(decided.get("paid-user")?.downgrade_reason).toBe(
            "paid_purchase",
        );

        expect(decided.get("shared-ip-review")?.downgrade_action).toBe("block");
        expect(decided.get("shared-ip-review")?.downgrade_reason).toBe(
            "shared_ip",
        );

        expect(decided.get("hammering-review")?.downgrade_action).toBe("block");
        expect(decided.get("hammering-review")?.downgrade_reason).toBe(
            "hammering",
        );

        expect(decided.get("shared-subnet-ok")?.downgrade_action).toBe(
            "review",
        );
        expect(decided.get("shared-subnet-ok")?.downgrade_reason).toBe(
            "shared_subnet",
        );

        expect(decided.get("missing-evidence")?.downgrade_action).toBe("");
        expect(decided.get("missing-evidence")?.downgrade_reason).toBe("");
    });

    test("apply candidate selection only targets current-run blocked rows on the source tier", () => {
        const ledgerPath = createTempLedgerPath();
        const rows = [
            makeRow({
                id: "apply-me",
                downgrade_action: "block",
                tier: "spore",
            }),
            makeRow({
                id: "wrong-tier",
                downgrade_action: "block",
                tier: "microbe",
            }),
            makeRow({
                id: "not-blocked",
                downgrade_action: "review",
                tier: "spore",
            }),
            makeRow({
                id: "old-run",
                run_id: "2026-04-04T12:00:00.000Z",
                downgrade_action: "block",
                tier: "spore",
            }),
        ];

        saveLedger(rows, ledgerPath);

        const loaded = loadLedger(ledgerPath);
        const candidates = selectApplyCandidates(loaded, {
            runId: "2026-04-05T12:00:00.000Z",
            fromTier: "spore",
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.id).toBe("apply-me");
        expect(candidates[0]?.tier).toBe("spore");
    });
});
