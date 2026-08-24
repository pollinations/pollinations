import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [
    inputArgument,
    month,
    evidence,
    expectedArgument,
    outputArgument,
    effectiveSnapshotArgument,
] = process.argv.slice(2);

if (
    !inputArgument ||
    !/^\d{4}-\d{2}$/.test(month ?? "") ||
    !evidence ||
    !expectedArgument ||
    !outputArgument ||
    !effectiveSnapshotArgument
) {
    throw new Error(
        "Usage: node vast-ai-usage-reconcile.mjs <invoices.json> <YYYY-MM> <evidence-url> <expected-total-usd> <output.ndjson> <effective-op-cloud-snapshot.json>",
    );
}

const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const workloadRegistryPath = fileURLToPath(
    new URL("../connectors/vast-ai-workloads.json", import.meta.url),
);
const expectedTotal = Number(expectedArgument);
if (!Number.isFinite(expectedTotal) || expectedTotal < 0) {
    throw new Error("Expected total must be a non-negative number");
}

const [year, monthNumber] = month.split("-").map(Number);
const periodStartMs = Date.UTC(year, monthNumber - 1, 1);
const periodEndMs = Date.UTC(year, monthNumber, 1);
const periodStart = `${month}-01 00:00:00`;
const periodEnd = new Date(periodEndMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
const recordedAt = (process.env.RECORDED_AT ?? new Date().toISOString())
    .slice(0, 23)
    .replace("T", " ")
    .replace("Z", "");

const workloadRegistry = JSON.parse(readFileSync(workloadRegistryPath, "utf8"));
const workloadByInstance = new Map();
for (const [model, instanceIds] of Object.entries(
    workloadRegistry.workloads ?? {},
)) {
    if (!Array.isArray(instanceIds)) {
        throw new Error(`Vast.ai workload ${model} must be an array`);
    }
    for (const instanceId of instanceIds) {
        const key = String(instanceId);
        const existing = workloadByInstance.get(key);
        if (existing && existing !== model) {
            throw new Error(
                `Vast.ai instance ${key} maps to both ${existing} and ${model}`,
            );
        }
        workloadByInstance.set(key, model);
    }
}

function chargeKind(description) {
    const value = String(description ?? "").toLowerCase();
    if (value.includes("gpu")) return "gpu";
    if (value.includes("storage")) return "storage";
    if (value.includes("download")) return "download";
    if (value.includes("upload")) return "upload";
    return null;
}

function allocationForMonth(row, kind) {
    const amount = Number(row.amount);
    const quantity = Number(row.quantity);
    const timestampMs = Number(row.timestamp) * 1000;
    if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        !Number.isFinite(timestampMs)
    ) {
        throw new Error(
            `Invalid Vast.ai charge row for instance ${row.instance_id}`,
        );
    }

    if (kind === "download" || kind === "upload") {
        if (timestampMs < periodStartMs || timestampMs >= periodEndMs)
            return null;
        return { amount, quantity };
    }

    if (quantity === 0) return null;
    const chargeStartMs = timestampMs - quantity * 60 * 60 * 1000;
    const overlapMs =
        Math.min(timestampMs, periodEndMs) -
        Math.max(chargeStartMs, periodStartMs);
    if (overlapMs <= 0) return null;
    const ratio = overlapMs / (timestampMs - chargeStartMs);
    return { amount: amount * ratio, quantity: quantity * ratio };
}

const sourceRows = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(sourceRows)) {
    throw new Error("Vast.ai input must be a JSON array");
}

const groups = new Map();
for (const row of sourceRows) {
    if (row.type !== "charge") continue;
    const kind = chargeKind(row.description);
    if (!kind) {
        throw new Error(
            `Unknown Vast.ai charge description: ${row.description}`,
        );
    }
    if (row.instance_id == null || String(row.instance_id).trim() === "") {
        throw new Error("Vast.ai charge is missing instance_id");
    }
    const allocation = allocationForMonth(row, kind);
    if (!allocation) continue;

    const instanceId = String(row.instance_id);
    const key = `${instanceId}|${kind}`;
    const group = groups.get(key) ?? {
        instanceId,
        kind,
        amount: 0,
        quantity: 0,
    };
    group.amount += allocation.amount;
    group.quantity += allocation.quantity;
    groups.set(key, group);
}

const details = [...groups.values()].sort(
    (left, right) =>
        left.instanceId.localeCompare(right.instanceId) ||
        left.kind.localeCompare(right.kind),
);
const calculatedTotal = details.reduce((sum, row) => sum + row.amount, 0);
if (Math.abs(calculatedTotal - expectedTotal) > 1e-8) {
    throw new Error(
        `Vast.ai ${month} total mismatch: calculated ${calculatedTotal}, expected ${expectedTotal}`,
    );
}

const shared = {
    start: periodStart,
    end: periodEnd,
    vendor: "vast.ai",
    account_id: "396700",
    account_name: "Myceli.AI",
    type: "gpu",
    model: "",
    credit: 0,
    currency: "USD",
    recorded_at: recordedAt,
};

const detailEntryIds = new Set(
    details.map(
        (detail) => `cli:vast.ai:${detail.kind}:${month}:${detail.instanceId}`,
    ),
);
const snapshot = JSON.parse(
    readFileSync(resolve(effectiveSnapshotArgument), "utf8"),
);
if (!Array.isArray(snapshot.data)) {
    throw new Error("Effective op_cloud snapshot must contain a data array");
}
const snapshotById = new Map(snapshot.data.map((row) => [row.entry_id, row]));
const supersededRows = snapshot.data
    .filter(
        (row) =>
            row.vendor === "vast.ai" &&
            row.type === "gpu" &&
            String(row.start ?? "").slice(0, 7) === month &&
            !detailEntryIds.has(row.entry_id),
    )
    .sort((left, right) => left.entry_id.localeCompare(right.entry_id));
const rows = [
    ...supersededRows.map((sourceRow) => ({
        ...shared,
        entry_id: sourceRow.entry_id,
        base_recorded_at: sourceRow.recorded_at,
        source: "tombstone",
        paid: 0,
        evidence: `Superseded by instance-level Vast.ai ${month} usage rows; ${evidence}`,
        resource_sku: "superseded",
        resource_count: 0,
        resource_id: "396700",
        resource_name: `Superseded Vast.ai ${month} account total`,
    })),
    ...details.map((detail) => {
        const entryId = `cli:vast.ai:${detail.kind}:${month}:${detail.instanceId}`;
        const existing = snapshotById.get(entryId);
        return {
            ...shared,
            entry_id: entryId,
            ...(existing ? { base_recorded_at: existing.recorded_at } : {}),
            source: "cli",
            model: workloadByInstance.get(detail.instanceId) ?? "",
            paid: -detail.amount,
            evidence,
            resource_sku:
                detail.kind === "download" || detail.kind === "upload"
                    ? `${detail.kind}-gb`
                    : `${detail.kind}-hours`,
            resource_count: detail.quantity,
            resource_id: detail.instanceId,
            resource_name: `Vast.ai instance ${detail.instanceId} · ${detail.kind}`,
        };
    }),
];

writeFileSync(
    outputPath,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
);
console.log(
    JSON.stringify({
        month,
        superseded_rows: supersededRows.length,
        detail_rows: details.length,
        billed_resources: new Set(details.map((row) => row.instanceId)).size,
        mapped_billed_resources: new Set(
            details
                .filter((row) => workloadByInstance.has(row.instanceId))
                .map((row) => row.instanceId),
        ).size,
        unmapped_billed_resources: new Set(
            details
                .filter((row) => !workloadByInstance.has(row.instanceId))
                .map((row) => row.instanceId),
        ).size,
        unmapped_usage_usd: details
            .filter((row) => !workloadByInstance.has(row.instanceId))
            .reduce((sum, row) => sum + row.amount, 0),
        calculated_total_usd: calculatedTotal,
        expected_total_usd: expectedTotal,
        output: outputPath,
    }),
);
