import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [
    stagingSnapshotArgument,
    productionSnapshotArgument,
    outputBaseArgument,
] = process.argv.slice(2);
if (
    !stagingSnapshotArgument ||
    !productionSnapshotArgument ||
    !outputBaseArgument
) {
    throw new Error(
        "Usage: node xai-staging-deduplicate.mjs <staging-snapshot.json> <production-snapshot.json> <output-base>",
    );
}

const ACCOUNT_ID = "ad7ac7e1-17f2-46e0-8dd2-7e99584f63e2";
const ACCOUNT_NAME = "Myceli.AI OÜ — tuesday-cuticle-eggnog";
const REPORT_EVIDENCE =
    "https://drive.google.com/file/d/1chJyV51I_wDX0e8Eyw3WG1uIKj9o1Eyf/view?usp=drivesdk";

function readRows(path) {
    const payload = JSON.parse(readFileSync(resolve(path), "utf8"));
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error(`${path} has no data array`);
    return rows;
}

const stagingRows = readRows(stagingSnapshotArgument);
const productionRows = readRows(productionSnapshotArgument);
const productionIds = new Set(
    productionRows
        .filter((row) => row.vendor === "xai")
        .map((row) => row.entry_id),
);

const duplicates = stagingRows.filter((row) => {
    const month = String(row.start).slice(0, 7);
    return (
        row.vendor === "xai" &&
        month >= "2026-03" &&
        month <= "2026-07" &&
        !productionIds.has(row.entry_id) &&
        !String(row.entry_id).startsWith("dashboard:xai:") &&
        Math.abs(Number(row.credit) || 0) + Math.abs(Number(row.paid) || 0) > 0
    );
});

if (duplicates.length !== 16) {
    throw new Error(
        `Expected 16 staging-only xAI rows, got ${duplicates.length}`,
    );
}

const expectedMonthlyTotals = {
    "2026-03": 308.54,
    "2026-04": 552.31,
    "2026-05": 322.3,
    "2026-06": 486.44,
    "2026-07": 430.22,
};
for (const [month, expected] of Object.entries(expectedMonthlyTotals)) {
    const actual = duplicates
        .filter((row) => String(row.start).startsWith(month))
        .reduce(
            (sum, row) =>
                sum - (Number(row.credit) || 0) - (Number(row.paid) || 0),
            0,
        );
    if (Math.abs(actual - expected) > 0.000001) {
        throw new Error(
            `${month}: expected duplicate total ${expected}, got ${actual}`,
        );
    }
}

const recordedAt = new Date().toISOString().replace("T", " ").replace("Z", "");
const corrections = duplicates.map((row) => ({
    ...row,
    base_recorded_at: row.recorded_at,
    source: "tombstone",
    account_id: ACCOUNT_ID,
    account_name: ACCOUNT_NAME,
    credit: 0,
    paid: 0,
    evidence: `${REPORT_EVIDENCE} — superseded duplicate legacy staging xAI aggregate row`,
    recorded_at: recordedAt,
}));

const outputBase = resolve(outputBaseArgument);
writeFileSync(
    `${outputBase}.ndjson`,
    `${corrections.map((row) => JSON.stringify(row)).join("\n")}\n`,
);

const correctionsById = new Map(corrections.map((row) => [row.entry_id, row]));
const simulatedRows = stagingRows
    .map((row) => correctionsById.get(row.entry_id) ?? row)
    .filter(
        (row) =>
            !(
                Number(row.credit) === 0 &&
                Number(row.paid) === 0 &&
                row.source === "tombstone"
            ),
    );
writeFileSync(
    `${outputBase}.simulated.json`,
    `${JSON.stringify({ data: simulatedRows })}\n`,
);

console.log(
    JSON.stringify({
        duplicate_rows: duplicates.length,
        monthly_duplicate_totals: expectedMonthlyTotals,
        effective_rows_after: simulatedRows.length,
    }),
);
