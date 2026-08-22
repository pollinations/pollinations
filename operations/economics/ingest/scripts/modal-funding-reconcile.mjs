import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node modal-funding-reconcile.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const rows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(rows)) throw new Error("Snapshot has no data array");

const CLI_EVIDENCE =
    "https://drive.google.com/file/d/18vPZT8LpCzuXpn2PpyrcleCdP4_IpNSq/view?usp=drivesdk";
const DASHBOARD_EVIDENCE =
    "https://drive.google.com/file/d/1iXQ7RhkGvYbqNCuFl3c9wJATjq4uX8it/view?usp=drivesdk";
const INVOICE_EVIDENCE =
    "https://drive.google.com/file/d/1J3JBrq70omnsUnM73EsjJvV7Rn_qjmFz/view?usp=drivesdk";
const PRIMARY_ACCOUNT_ID = "myceli-ai";
const PRIMARY_ACCOUNT_NAME = "myceli-ai";
const MARCH_PAYABLE_USD = 417.31;

function monthOf(row) {
    return String(row.start ?? "").slice(0, 7);
}

function isFunding(row) {
    return Number(row.credit) > 0 && Number(row.paid) === 0;
}

function usageBurn(row) {
    return -(Number(row.credit) + Number(row.paid));
}

function summarize(inputRows) {
    const summary = {};
    for (const row of inputRows) {
        if (isFunding(row)) continue;
        const month = monthOf(row);
        summary[month] ??= { credit: 0, paid: 0, usage: 0, rows: 0 };
        summary[month].credit += -Number(row.credit);
        summary[month].paid += -Number(row.paid);
        summary[month].usage += usageBurn(row);
        summary[month].rows += 1;
    }
    return summary;
}

const modalRows = rows.filter(
    (row) => row.vendor === "modal" && monthOf(row).startsWith("2026-"),
);
if (modalRows.length === 0) throw new Error("Snapshot has no 2026 Modal rows");

const marchRows = modalRows
    .filter((row) => monthOf(row) === "2026-03" && !isFunding(row))
    .sort((a, b) => a.entry_id.localeCompare(b.entry_id));
const marchUsageUsd = marchRows.reduce((sum, row) => sum + usageBurn(row), 0);
if (marchUsageUsd <= MARCH_PAYABLE_USD) {
    throw new Error(
        `March usage ${marchUsageUsd} is not greater than payable ${MARCH_PAYABLE_USD}`,
    );
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
let allocatedMarchPaid = 0;
const marchPaidByEntryId = new Map(
    marchRows.map((row, index) => {
        const paidBurn =
            index === marchRows.length - 1
                ? MARCH_PAYABLE_USD - allocatedMarchPaid
                : (MARCH_PAYABLE_USD * usageBurn(row)) / marchUsageUsd;
        allocatedMarchPaid += paidBurn;
        return [row.entry_id, paidBurn];
    }),
);
const updates = modalRows.map((row) => {
    const month = monthOf(row);
    const updated = {
        ...row,
        account_id: PRIMARY_ACCOUNT_ID,
        account_name: PRIMARY_ACCOUNT_NAME,
        recorded_at: recordedAt,
    };

    if (isFunding(row)) {
        updated.evidence = DASHBOARD_EVIDENCE;
        return updated;
    }

    const gross = usageBurn(row);
    updated.evidence = `${CLI_EVIDENCE} · funding review ${DASHBOARD_EVIDENCE}`;

    if (month === "2026-03") {
        const paidBurn = marchPaidByEntryId.get(row.entry_id);
        if (paidBurn == null) {
            throw new Error(`Missing March allocation for ${row.entry_id}`);
        }
        updated.paid = -paidBurn;
        updated.credit = -(gross - paidBurn);
        updated.evidence += ` · invoice ${INVOICE_EVIDENCE}`;
    } else if (["2026-04", "2026-06", "2026-07"].includes(month)) {
        updated.paid = 0;
        updated.credit = -gross;
    }

    return updated;
});

for (const accountId of ["myceli-ai2", "elliot-4"]) {
    updates.push({
        entry_id: `manual:modal:inference:2026-01-01 00:00:00:verified-zero:${accountId}`,
        source: "manual",
        start: "2026-01-01 00:00:00",
        end: "2026-08-21 00:00:00",
        vendor: "modal",
        account_id: accountId,
        account_name: accountId,
        type: "inference",
        model: "",
        credit: 0,
        paid: 0,
        currency: "USD",
        evidence: DASHBOARD_EVIDENCE,
        recorded_at: recordedAt,
        resource_sku: "verified-zero",
        resource_count: 0,
        resource_id: `${accountId}:verified-zero`,
        resource_name: `${accountId} verified zero usage`,
    });
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const simulatedById = new Map(rows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const simulatedModalRows = [...simulatedById.values()].filter(
    (row) => row.vendor === "modal" && monthOf(row).startsWith("2026-"),
);
const before = summarize(modalRows);
const after = summarize(simulatedModalRows);
for (const month of Object.keys(before)) {
    const delta = Math.abs(before[month].usage - after[month].usage);
    if (delta > 1e-8) {
        throw new Error(`Modal gross usage changed in ${month} by ${delta}`);
    }
}
if (Math.abs((after["2026-03"]?.paid ?? 0) - MARCH_PAYABLE_USD) > 1e-8) {
    throw new Error("March Modal payable does not reconcile to the invoice");
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
            evidence: {
                cli_usage: CLI_EVIDENCE,
                dashboard_account_and_funding: DASHBOARD_EVIDENCE,
                march_invoice: INVOICE_EVIDENCE,
            },
            accounts: {
                primary: PRIMARY_ACCOUNT_ID,
                verified_zero: ["myceli-ai2", "elliot-4"],
            },
            proposed_updates: updates.length,
            duplicate_entry_ids: duplicateEntryIds,
            before,
            after,
            invariants: {
                gross_usage_preserved_by_month: true,
                march_provider_payable_usd: MARCH_PAYABLE_USD,
                secondary_accounts_verified_zero_through: "2026-08-21",
            },
        },
        null,
        2,
    )}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: [...simulatedById.values()] })}\n`,
);

console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        march_usage_usd: marchUsageUsd,
        march_provider_payable_usd: after["2026-03"].paid,
        post_correction_paid_usd: Object.values(after).reduce(
            (sum, month) => sum + month.paid,
            0,
        ),
        duplicate_entry_ids: duplicateEntryIds,
    }),
);
