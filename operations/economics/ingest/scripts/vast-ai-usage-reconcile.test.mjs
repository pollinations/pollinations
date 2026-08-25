import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./vast-ai-usage-reconcile.mjs", import.meta.url);
const evidence = "https://drive.google.com/file/d/test/view";
const month = "2026-08";

const sourceRows = [
    {
        type: "charge",
        description: "GPU",
        instance_id: 123,
        amount: 10,
        quantity: 1,
        timestamp: Date.UTC(2026, 7, 2) / 1_000,
    },
];

function fixture(snapshotRows) {
    const directory = mkdtempSync(join(tmpdir(), "vast-reconcile-"));
    const input = join(directory, "input.json");
    const snapshot = join(directory, "snapshot.json");
    const output = join(directory, "output.ndjson");
    writeFileSync(input, JSON.stringify(sourceRows));
    writeFileSync(snapshot, JSON.stringify({ data: snapshotRows }));
    return { input, snapshot, output };
}

function argumentsFor(paths) {
    return [
        script.pathname,
        paths.input,
        month,
        evidence,
        "10",
        paths.output,
        paths.snapshot,
    ];
}

test("supersedes only rows owned by the Vast CLI import", () => {
    const paths = fixture([
        {
            entry_id: "cli:vast.ai:gpu:2026-08-01 00:00:00:999:flux",
            source: "cli",
            vendor: "vast.ai",
            account_id: "396700",
            type: "gpu",
            start: "2026-08-01 00:00:00",
            recorded_at: "2026-08-01 00:00:00.000",
        },
        {
            entry_id: "manual:vast.ai:gpu:2026-08:adjustment",
            source: "manual",
            vendor: "vast.ai",
            account_id: "396700",
            type: "gpu",
            start: "2026-08-01 00:00:00",
            recorded_at: "2026-08-01 00:00:00.000",
        },
        {
            entry_id: "cli:vast.ai:gpu:2026-08:456",
            source: "cli",
            vendor: "vast.ai",
            account_id: "other-account",
            type: "gpu",
            start: "2026-08-01 00:00:00",
            recorded_at: "2026-08-01 00:00:00.000",
        },
    ]);

    execFileSync(process.execPath, argumentsFor(paths), { stdio: "pipe" });
    const rows = readFileSync(paths.output, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);

    assert.deepEqual(
        rows.map((row) => [row.entry_id, row.source]),
        [
            ["cli:vast.ai:gpu:2026-08-01 00:00:00:999:flux", "tombstone"],
            ["cli:vast.ai:gpu:2026-08:123", "cli"],
        ],
    );
});

test("fails instead of superseding a managed id with an unexpected source", () => {
    const paths = fixture([
        {
            entry_id: "cli:vast.ai:gpu:2026-08:999",
            source: "manual",
            vendor: "vast.ai",
            account_id: "396700",
            type: "gpu",
            start: "2026-08-01 00:00:00",
            recorded_at: "2026-08-01 00:00:00.000",
        },
    ]);

    const result = spawnSync(process.execPath, argumentsFor(paths), {
        encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unexpected source manual/);
});
