import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node cloudflare-account-witness-reconcile.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const rows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(rows)) throw new Error("Snapshot has no data array");

const INVOICE_EVIDENCE =
    "https://drive.google.com/file/d/1YC2v9UfIuCWFLxyQQQukBkBs-0vxx0Jy/view?usp=drivesdk";
const BILLING_HISTORY_EVIDENCE =
    "https://drive.google.com/file/d/130G5oS7yKDERRZTiXs-9NW_oDxp6_LFe/view?usp=drivesdk";
const ENTRY_ID =
    "invoice:cloudflare:infra:2026-02-01 00:00:00:IN-58053737-account-witness:";

const accountEvidence = rows.find(
    (row) =>
        row.vendor === "cloudflare" &&
        row.account_id === "myceli" &&
        String(row.evidence ?? "").includes("IN-58053737"),
);
if (!accountEvidence) {
    throw new Error("Snapshot has no Myceli Cloudflare IN-58053737 evidence");
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const witness = {
    entry_id: ENTRY_ID,
    source: "invoice",
    start: "2026-02-01 00:00:00",
    end: "2026-03-01 00:00:00",
    vendor: "cloudflare",
    account_id: "myceli",
    account_name: "Myceli.AI OÜ",
    type: "infra",
    model: "",
    credit: 0,
    paid: 0,
    currency: "USD",
    evidence: `${INVOICE_EVIDENCE} — invoice IN-58053737 covers 2026-01-22..2026-03-21; every metered quantity, subtotal, total, and amount due is USD 0.00 · billing history ${BILLING_HISTORY_EVIDENCE}`,
    recorded_at: recordedAt,
    resource_sku: "verified-zero",
    resource_count: 0,
    resource_id: "IN-58053737-account-witness",
    resource_name: "Myceli monthly account invoice witness",
};

const legacyPollinationsUpdates = rows
    .filter(
        (row) =>
            row.vendor === "cloudflare" &&
            String(row.resource_id ?? "").startsWith("IN-54966851-") &&
            !String(row.account_id ?? "").trim(),
    )
    .map((row) => ({
        ...row,
        base_recorded_at: row.recorded_at,
        account_id: "pollinations",
        account_name: "Pollinations.ai (legacy)",
        recorded_at: recordedAt,
    }));
if (legacyPollinationsUpdates.length !== 3) {
    throw new Error(
        `Expected 3 unassigned IN-54966851 rows, found ${legacyPollinationsUpdates.length}`,
    );
}

const updates = [witness, ...legacyPollinationsUpdates];
if (new Set(updates.map((row) => row.entry_id)).size !== updates.length) {
    throw new Error("Generated duplicate Cloudflare account update IDs");
}

const simulatedById = new Map(rows.map((row) => [row.entry_id, row]));
for (const update of updates) simulatedById.set(update.entry_id, update);

const signedCloudflareTotal = (inputRows) =>
    inputRows
        .filter((row) => row.vendor === "cloudflare")
        .reduce((sum, row) => sum + Number(row.credit) + Number(row.paid), 0);
const beforeTotal = signedCloudflareTotal(rows);
const afterRows = [...simulatedById.values()];
const afterTotal = signedCloudflareTotal(afterRows);
if (Math.abs(beforeTotal - afterTotal) > 1e-9) {
    throw new Error("Cloudflare financial total changed after zero witness");
}

writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: recordedAt,
            source_snapshot: snapshotPath,
            proposed_updates: updates.length,
            account: "myceli",
            month: "2026-02",
            legacy_pollinations_rows_assigned: legacyPollinationsUpdates.length,
            evidence: {
                invoice: INVOICE_EVIDENCE,
                billing_history: BILLING_HISTORY_EVIDENCE,
            },
            invariants: {
                provider_financial_total_unchanged: true,
                verified_zero_usage_and_amount_due_usd: 0,
            },
        },
        null,
        2,
    )}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: afterRows })}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        account: "myceli",
        month: "2026-02",
        legacy_pollinations_rows_assigned: legacyPollinationsUpdates.length,
        provider_financial_total_unchanged: beforeTotal === afterTotal,
    }),
);
