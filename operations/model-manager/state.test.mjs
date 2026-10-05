import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sourceBundle } from "./bundle.mjs";
import { pilotDecision, scheduledSlot, stateFiles } from "./state.mjs";

test("VM source bundle excludes credentials and macOS migration sidecars", async () => {
    const { archive } = await sourceBundle();
    const entries = execFileSync("tar", ["-tzf", "-"], {
        input: archive,
        encoding: "utf8",
    }).split("\n");
    assert(
        entries.some((name) =>
            name.endsWith("enter.pollinations.ai/scripts/code-agent-sdk.mjs"),
        ),
    );
    assert(
        entries.some((name) =>
            name.endsWith("gen.pollinations.ai/tsconfig.json"),
        ),
    );
    assert(!entries.some((name) => /(^|\/)\._|(^|\/)secrets\//.test(name)));
    const migrations = entries.filter((name) =>
        /enter\.pollinations\.ai\/drizzle\/[^/]+\.sql$/.test(name),
    );
    const tracked = execFileSync(
        "git",
        ["ls-files", "enter.pollinations.ai/drizzle/*.sql"],
        { encoding: "utf8", cwd: new URL("../../", import.meta.url) },
    )
        .trim()
        .split("\n")
        .filter(
            (name) =>
                !name
                    .slice("enter.pollinations.ai/drizzle/".length)
                    .includes("/"),
        );
    assert.equal(migrations.length, tracked.length);
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

test("Daily slot follows Berlin DST and tolerates delayed Actions dispatch", () => {
    assert.equal(scheduledSlot("0 6 * * *", "2026-10-24T08:45:00Z"), true);
    assert.equal(scheduledSlot("0 7 * * *", "2026-10-24T08:45:00Z"), false);
    assert.equal(scheduledSlot("0 6 * * *", "2026-10-25T08:45:00Z"), false);
    assert.equal(scheduledSlot("0 7 * * *", "2026-10-25T08:45:00Z"), true);
    assert.equal(scheduledSlot("0 6 * * *", "2027-03-28T06:30:00Z"), true);
});

test("State retains 90 daily snapshots and omits credential files and locks", async () => {
    const directory = await mkdtemp(
        join(tmpdir(), "model-manager-state-test-"),
    );
    try {
        for (let day = 0; day < 95; day++) {
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
        assert.equal(Object.keys(files).length, 91);
        assert.equal(files["snapshot-2026-01-01.json"], undefined);
        assert.equal(files["prod.vars.json"], undefined);
        assert.equal(files["run.lock"], undefined);
        assert.equal(files["notified.json"], "{}");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
