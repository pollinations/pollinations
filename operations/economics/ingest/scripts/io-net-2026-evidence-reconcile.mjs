import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [
    cloudArgument,
    pollenArgument,
    transactionsArgument,
    gpuRunsArgument,
    reportArgument,
    outputBaseArgument,
    reportUrl,
    evidenceUrl,
] = process.argv.slice(2);
if (
    !cloudArgument ||
    !pollenArgument ||
    !transactionsArgument ||
    !gpuRunsArgument ||
    !reportArgument ||
    !outputBaseArgument ||
    !reportUrl
) {
    throw new Error(
        "Usage: node io-net-2026-evidence-reconcile.mjs <op-cloud.json> <op-pollen.json> <op-transactions.json> <gpu-runs.ndjson> <dashboard-report.md> <output-base> <report-drive-url> [evidence-drive-url]",
    );
}

function readJsonRows(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    const payload = JSON.parse(contents);
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return {
        path,
        contents,
        rows,
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

function readNdjson(pathArgument) {
    const path = resolve(pathArgument);
    const contents = readFileSync(path, "utf8");
    return {
        path,
        contents,
        rows: contents
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line)),
        sha256: createHash("sha256").update(contents).digest("hex"),
    };
}

function sum(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

const cloud = readJsonRows(cloudArgument);
const pollen = readJsonRows(pollenArgument);
const transactions = readJsonRows(transactionsArgument);
const gpuRuns = readNdjson(gpuRunsArgument);
const reportPath = resolve(reportArgument);
const reportContents = readFileSync(reportPath, "utf8");
const outputBase = resolve(outputBaseArgument);

const cloudRows = cloud.rows.filter(
    (row) =>
        row.vendor === "io.net" &&
        (row.start.startsWith("2026-01") || row.start.startsWith("2026-02")),
);
const runRows = cloudRows.filter((row) => Number(row.paid) < 0);
const refundRows = cloudRows.filter((row) => Number(row.paid) > 0);
const backupRuns = gpuRuns.rows.filter(
    (row) =>
        row.vendor === "io.net" &&
        (row.month === "2026-01" || row.month === "2026-02"),
);
const ioNetTransactions = transactions.rows.filter(
    (row) => row.vendor === "io.net",
);
const pollenMarch = pollen.rows.filter(
    (row) => row.vendor === "io.net" && row.month === "2026-03",
);

if (
    cloudRows.length !== 22 ||
    runRows.length !== 12 ||
    refundRows.length !== 10
) {
    throw new Error(
        `Unexpected io.net cloud shape: ${cloudRows.length} rows, ${runRows.length} runs, ${refundRows.length} refunds`,
    );
}
if (backupRuns.length !== 12) {
    throw new Error(
        `Expected 12 legacy io.net GPU runs, found ${backupRuns.length}`,
    );
}
const backupRunCost = sum(backupRuns, "cost");
const bookedRunCost = -sum(runRows, "paid");
const refunds = sum(refundRows, "paid");
const netBookedCost = -sum(cloudRows, "paid");
if (
    Math.abs(backupRunCost - bookedRunCost) > 0.000001 ||
    Math.abs(bookedRunCost - refunds - netBookedCost) > 0.000001
) {
    throw new Error("io.net GPU run/refund reconciliation failed");
}

const latestDeploymentEnd = backupRuns
    .map((row) => row.ended_at)
    .sort()
    .at(-1);
const latestPaymentDate = ioNetTransactions
    .map((row) => row.date)
    .sort()
    .at(-1);
const marchPollenCost = pollenMarch.reduce(
    (total, row) => total + Number(row.cost_paid) + Number(row.cost_quests),
    0,
);
const generatedAt = new Date().toISOString();
const evidencePacket = {
    generated_at: generatedAt,
    purpose:
        "Archive the surviving io.net January-February 2026 deployment, refund, invoice, and payment evidence and document the unresolved March routing-label mismatch.",
    provenance: {
        cloud_snapshot: cloud.path,
        cloud_snapshot_sha256: cloud.sha256,
        pollen_snapshot: pollen.path,
        pollen_snapshot_sha256: pollen.sha256,
        transactions_snapshot: transactions.path,
        transactions_snapshot_sha256: transactions.sha256,
        legacy_gpu_runs_backup: gpuRuns.path,
        legacy_gpu_runs_backup_sha256: gpuRuns.sha256,
        legacy_dashboard_audit: reportPath,
        legacy_dashboard_audit_sha256: createHash("sha256")
            .update(reportContents)
            .digest("hex"),
        legacy_dashboard_audit_drive_url: reportUrl,
    },
    january_february_reconciliation: {
        deployment_rows: backupRuns.length,
        booked_run_rows: runRows.length,
        refund_rows: refundRows.length,
        gross_gpu_run_cost_usd: bookedRunCost,
        refunds_usd: refunds,
        net_gpu_cost_usd: netBookedCost,
        latest_deployment_end_utc: latestDeploymentEnd,
    },
    provider_payments: {
        rows: ioNetTransactions,
        latest_payment_date: latestPaymentDate,
        note: "Provider invoices and Wise rows prove wallet top-ups and fees; they do not by themselves prove per-deployment consumption.",
    },
    march_open_item: {
        pollen_rows: pollenMarch,
        internal_meter_cost_usd: marchPollenCost,
        registry_provider_changed_from_io_net_to_vast_ai_on: "2026-03-05",
        registry_change_commit: "123381cd4b059d4774a5c56e436f52f5a621c3e9",
        finding:
            "March Pollen rows carry the historical io.net registry label, but the surviving provider evidence ends on February 1. The physical provider for this March meter amount remains unverified and is deliberately not booked as an io.net provider cost.",
    },
    limitation:
        "The original dashboard screenshots referenced by the legacy rows were not retained locally or in Drive. The preserved dashboard-derived run table, archived audit report, provider invoices, and Wise matches are the surviving evidence.",
    cloud_rows: cloudRows,
    legacy_gpu_runs: backupRuns,
};
writeFileSync(
    `${outputBase}.evidence.json`,
    `${JSON.stringify(evidencePacket, null, 2)}\n`,
);

if (!evidenceUrl) {
    console.log(
        JSON.stringify({
            evidence_file: `${outputBase}.evidence.json`,
            cloud_rows: cloudRows.length,
            gross_gpu_run_cost_usd: bookedRunCost,
            refunds_usd: refunds,
            net_gpu_cost_usd: netBookedCost,
            march_open_meter_usd: marchPollenCost,
        }),
    );
    process.exit(0);
}
if (!evidenceUrl.startsWith("https://drive.google.com/")) {
    throw new Error("Evidence URL must be an archived Google Drive URL");
}

const recordedAt = generatedAt.replace("T", " ").replace("Z", "");
const updates = cloudRows.map((row) => ({
    ...row,
    evidence: evidenceUrl,
    recorded_at: recordedAt,
}));
const simulated = new Map(cloud.rows.map((row) => [row.entry_id, row]));
for (const row of updates) simulated.set(row.entry_id, row);
writeFileSync(
    `${outputBase}.ndjson`,
    `${updates.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: [...simulated.values()] })}\n`,
);
writeFileSync(
    `${outputBase}.report.json`,
    `${JSON.stringify(
        {
            generated_at: generatedAt,
            evidence: evidenceUrl,
            proposed_updates: updates.length,
            gross_gpu_run_cost_usd: bookedRunCost,
            refunds_usd: refunds,
            net_gpu_cost_usd: netBookedCost,
            march_open_meter_usd: marchPollenCost,
        },
        null,
        2,
    )}\n`,
);
console.log(
    JSON.stringify({
        proposed_updates: updates.length,
        net_gpu_cost_usd: netBookedCost,
        march_open_meter_usd: marchPollenCost,
    }),
);
