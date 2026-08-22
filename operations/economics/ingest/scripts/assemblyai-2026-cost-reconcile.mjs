import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [snapshotPathArgument, outputBaseArgument] = process.argv.slice(2);
if (!snapshotPathArgument || !outputBaseArgument) {
    throw new Error(
        "Usage: node assemblyai-2026-cost-reconcile.mjs <op-cloud-snapshot.json> <output-base>",
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const economicsDirectory = resolve(scriptDirectory, "../..");
const inboxDirectory = resolve(
    economicsDirectory,
    "ingest/data/inbox/assemblyai",
);
const snapshotPath = resolve(snapshotPathArgument);
const outputBase = resolve(outputBaseArgument);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const snapshotRows = Array.isArray(snapshot) ? snapshot : snapshot.data;
if (!Array.isArray(snapshotRows)) throw new Error("Snapshot has no data array");

const evidenceByMonth = {
    "2026-01":
        "https://drive.google.com/file/d/14yTSRyvoOf6X8vZwbNK6fi5wVT63qOi8/view?usp=drivesdk",
    "2026-05":
        "https://drive.google.com/file/d/1nYgEPelvS0Yg6b3XA_Zx6mg-4mtPd2ZF/view?usp=drivesdk",
    "2026-06":
        "https://drive.google.com/file/d/1WfOZwMUEcKXFA9cOC74JltxWzyVYfnM6/view?usp=drivesdk",
};

function nextMonth(month) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

function canonicalModel(model) {
    if (model === "Universal 2" || model === "Universal-2") {
        return "universal-2";
    }
    if (model === "Universal-3 Pro") return "universal-3-pro";
    return model.toLowerCase().replaceAll(" ", "-");
}

function readMonthlyExport(month) {
    const path = resolve(inboxDirectory, `assemblyai-cost-${month}.csv`);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const header = lines.shift();
    if (header !== "date,region,product,model,value,unit") {
        throw new Error(`Unexpected AssemblyAI CSV header in ${path}`);
    }

    const byModel = new Map();
    for (const line of lines) {
        const [date, region, product, model, value, unit] = line.split(",");
        if (!date.startsWith(month) || unit !== "USD") {
            throw new Error(`Unexpected AssemblyAI row in ${path}: ${line}`);
        }
        const key = canonicalModel(model);
        const summary = byModel.get(key) ?? {
            rawModel: model,
            total: 0,
            rows: 0,
            region,
            product,
        };
        summary.total += Number(value);
        summary.rows += 1;
        byModel.set(key, summary);
    }
    return new Map(
        [...byModel].filter(([, summary]) => summary.total > 0.000000001),
    );
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const rowsById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
const exportsByMonth = new Map(
    Object.keys(evidenceByMonth).map((month) => [
        month,
        readMonthlyExport(month),
    ]),
);
const updates = [];

const legacyJanuaryId = "manual:assemblyai:inference:2026-01-01 00:00:00::";
const legacyJanuary = rowsById.get(legacyJanuaryId);
if (!legacyJanuary) {
    throw new Error(`Missing legacy AssemblyAI row ${legacyJanuaryId}`);
}
updates.push({
    ...legacyJanuary,
    credit: 0,
    paid: 0,
    evidence: `${evidenceByMonth["2026-01"]} · superseded by the exact dashboard model export`,
    recorded_at: recordedAt,
});

for (const [month, models] of exportsByMonth) {
    for (const [model, summary] of models) {
        let entryId = `dashboard:assemblyai:inference:${month}-01 00:00:00:cost-export:${model}`;
        let existing;
        if (month === "2026-05" && model === "universal-2") {
            entryId = "ingest:assemblyai:inference:2026-05-01::Universal-2";
            existing = rowsById.get(entryId);
        } else if (month === "2026-05" && model === "universal-3-pro") {
            entryId = "ingest:assemblyai:inference:2026-05-01::Universal-3 Pro";
            existing = rowsById.get(entryId);
        } else if (month === "2026-06" && model === "universal-2") {
            entryId = "ingest:assemblyai:inference:2026-06-01::Universal-2";
            existing = rowsById.get(entryId);
        } else if (month === "2026-06" && model === "universal-3-pro") {
            entryId = "ingest:assemblyai:inference:2026-06-01::Universal-3 Pro";
            existing = rowsById.get(entryId);
        }
        if (month !== "2026-01" && !existing) {
            throw new Error(`Missing AssemblyAI row ${entryId}`);
        }

        const row = {
            ...(existing ?? {}),
            entry_id: entryId,
            source: "dashboard",
            start: `${month}-01 00:00:00`,
            end: `${nextMonth(month)} 00:00:00`,
            vendor: "assemblyai",
            account_id: "",
            account_name: "",
            type: "inference",
            model,
            credit: -summary.total,
            paid: 0,
            currency: "USD",
            evidence: evidenceByMonth[month],
            recorded_at: recordedAt,
            resource_sku: summary.rawModel,
            resource_count: summary.rows,
            resource_id: `assemblyai:${model}`,
            resource_name: model,
        };

        if (existing) {
            const oldUsage = -(Number(existing.credit) + Number(existing.paid));
            if (Math.abs(oldUsage - summary.total) > 0.000001) {
                throw new Error(
                    `${entryId} ledger usage ${oldUsage} does not match export ${summary.total}`,
                );
            }
        }
        updates.push(row);
    }
}

const duplicateEntryIds =
    updates.length - new Set(updates.map((row) => row.entry_id)).size;
if (duplicateEntryIds !== 0) {
    throw new Error(`Generated ${duplicateEntryIds} duplicate entry IDs`);
}

const simulatedById = new Map(snapshotRows.map((row) => [row.entry_id, row]));
for (const row of updates) simulatedById.set(row.entry_id, row);
const totals = Object.fromEntries(
    [...exportsByMonth].map(([month, models]) => [
        month,
        Object.fromEntries(
            [...models].map(([model, summary]) => [model, summary.total]),
        ),
    ]),
);

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
            evidence_by_month: evidenceByMonth,
            proposed_updates: updates.length,
            duplicate_entry_ids: duplicateEntryIds,
            model_cost_usd_by_month: totals,
            invariants: {
                may_and_june_ledger_totals_match_dashboard_exports: true,
                january_rounded_legacy_row_replaced_by_exact_export: true,
                provider_payable_usd: 0,
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
        duplicate_entry_ids: duplicateEntryIds,
        model_cost_usd_by_month: totals,
    }),
);
