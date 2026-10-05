import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sourceBundle } from "./bundle.mjs";
import { pilotDecision, stateFiles } from "./state.mjs";

test("VM bundle runs without a checkout or installed dependencies", async () => {
    const { code, manifest } = await sourceBundle();
    const directory = await mkdtemp(
        join(tmpdir(), "model-manager-bundle-test-"),
    );
    try {
        const file = join(directory, "run.mjs");
        await writeFile(file, code);
        const output = execFileSync(process.execPath, [file, "--help"], {
            cwd: directory,
            encoding: "utf8",
        });
        assert.match(output, /Report-only model manager/);
        assert.match(manifest.revision, /^[a-f0-9]{40}$/);
        assert.match(manifest.bundleSha256, /^[a-f0-9]{64}$/);
        assert.ok(!code.includes("code-agent-sdk"));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Pilot stops after 14 Berlin calendar days, including the DST change", () => {
    const pilot = { startedDay: "2026-10-20", days: [], spentPollen: 0 };
    assert.equal(
        pilotDecision(pilot, "2026-11-02T23:00:00Z"),
        "observation_window_finished",
    );
    assert.equal(pilotDecision(pilot, "2026-11-02T22:59:59Z"), "run");
    assert.equal(
        pilotDecision(
            { ...pilot, days: ["2026-10-25"] },
            "2026-10-25T07:00:00Z",
        ),
        "already_recorded",
    );
    assert.equal(
        pilotDecision({ ...pilot, spentPollen: 1.9 }, "2026-10-25T07:00:00Z"),
        "pilot_budget_exhausted",
    );
    assert.throws(() => pilotDecision({ ...pilot, startedDay: "invalid" }));
});

test("State retains the 14 pilot snapshots and omits credential files and locks", async () => {
    const directory = await mkdtemp(
        join(tmpdir(), "model-manager-state-test-"),
    );
    try {
        for (let day = 0; day < 20; day++) {
            const at = new Date(Date.UTC(2026, 0, 1 + day))
                .toISOString()
                .slice(0, 10);
            await writeFile(
                join(directory, `snapshot-${at}.json`),
                JSON.stringify({ at }),
            );
        }
        await writeFile(join(directory, "notified.json"), "{}");
        await writeFile(
            join(directory, "prod.vars.json"),
            "fake credential fixture",
        );
        await writeFile(join(directory, "run.lock"), "lock");
        const files = await stateFiles(directory);
        assert.equal(Object.keys(files).length, 15);
        assert.equal(files["snapshot-2026-01-01.json"], undefined);
        assert.equal(files["prod.vars.json"], undefined);
        assert.equal(files["run.lock"], undefined);
        assert.equal(files["notified.json"], "{}");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
