import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dayKey } from "./analyze.mjs";
import { sourceBundle } from "./bundle.mjs";
import { pilotDecision, recordCompletion, stateFiles } from "./state.mjs";

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

test("Failed assessment leaves today runnable; completion stops further paid work", () => {
    const at = "2026-10-05T06:00:00Z";
    const pilot = { startedDay: dayKey(at), days: [], spentPollen: 0.02 };
    const report = { at, assessment: { status: "failed" } };
    assert.throws(() => recordCompletion(pilot, report));
    assert.equal(pilotDecision(pilot, at), "run");
    assert.deepEqual(pilot.days, []);
    report.assessment.status = "complete";
    recordCompletion(pilot, report);
    assert.equal(pilotDecision(pilot, at), "already_recorded");
    assert.equal(pilot.spentPollen, 0.02);
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
            join(directory, "pending.json"),
            '[{"fingerprint":"unselected"}]',
        );
        await writeFile(
            join(directory, "prod.vars.json"),
            "fake credential fixture",
        );
        await writeFile(join(directory, "run.lock"), "lock");
        await writeFile(join(directory, "report.md"), "Previous run summary");
        const files = await stateFiles(directory);
        assert.equal(Object.keys(files).length, 16);
        assert.equal(files["snapshot-2026-01-01.json"], undefined);
        assert.equal(files["prod.vars.json"], undefined);
        assert.equal(files["run.lock"], undefined);
        assert.equal(files["report.md"], undefined);
        assert.equal(files["notified.json"], "{}");
        assert.equal(files["pending.json"], '[{"fingerprint":"unselected"}]');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Skipped and failed launches remove stale summaries and emit current workflow status", async () => {
    const today = dayKey(new Date().toISOString());
    for (const [status, pilot] of [
        [
            "already_recorded",
            { startedDay: today, days: [today], spentPollen: 0 },
        ],
        [
            "observation_window_finished",
            { startedDay: "2000-01-01", days: [], spentPollen: 0 },
        ],
        [
            "pilot_budget_exhausted",
            { startedDay: today, days: [], spentPollen: 1.9 },
        ],
        ["failed", "malformed JSON"],
    ]) {
        const data = await mkdtemp(
            join(tmpdir(), "model-manager-launch-test-"),
        );
        try {
            await writeFile(
                join(data, "pilot.json"),
                typeof pilot === "string" ? pilot : JSON.stringify(pilot),
            );
            await writeFile(join(data, "report.md"), "Previous run summary");
            await writeFile(
                join(data, "verification.json"),
                "Prior successful evidence",
            );
            const output = join(data, "outputs");
            const result = spawnSync(
                process.execPath,
                [
                    new URL("launch.mjs", import.meta.url).pathname,
                    "--out",
                    data,
                ],
                {
                    encoding: "utf8",
                    env: { ...process.env, GITHUB_OUTPUT: output },
                },
            );
            assert.equal(
                result.status,
                status === "failed" ? 1 : 0,
                result.stderr,
            );
            assert.equal(
                await readFile(output, "utf8"),
                `status=${status}\ncheckpoint=${status === "failed"}\n`,
            );
            await assert.rejects(readFile(join(data, "report.md")), {
                code: "ENOENT",
            });
            if (status !== "failed") {
                assert.match(result.stdout, /no VM or inference call/);
                assert.equal(
                    await readFile(join(data, "verification.json"), "utf8"),
                    "Prior successful evidence",
                );
            } else {
                assert.equal(
                    JSON.parse(
                        await readFile(join(data, "verification.json"), "utf8"),
                    ).status,
                    "failed",
                );
            }
        } finally {
            await rm(data, { recursive: true, force: true });
        }
    }
});
