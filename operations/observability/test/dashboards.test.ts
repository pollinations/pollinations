import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
    currentDashboards,
    DEFAULT_DASHBOARD_UID,
    dashboardSrc,
    readDashboardUid,
} from "../frontend/src/dashboards.ts";

test("keeps top-level dashboards and drops foldered legacy ones", () => {
    assert.deepEqual(
        currentDashboards([
            { uid: "users-balances-rebuild", title: "Users & Balances" },
            { uid: "core-api-rebuild", title: "Direct API" },
            {
                uid: "pollen-flow",
                title: "Pollen Flow",
                folderUid: "legacy-folder",
            },
        ]),
        [
            { uid: "core-api-rebuild", title: "Direct API" },
            { uid: "users-balances-rebuild", title: "Users & Balances" },
        ],
    );
});

test("ignores search rows without a uid or title", () => {
    assert.deepEqual(
        currentDashboards([{ title: "No uid" }, { uid: "no-title" }, {}]),
        [],
    );
});

test("falls back to the Grafana home dashboard without a url parameter", () => {
    assert.equal(readDashboardUid(""), DEFAULT_DASHBOARD_UID);
    assert.equal(readDashboardUid("?d="), DEFAULT_DASHBOARD_UID);
    assert.equal(readDashboardUid("?d=core-api-rebuild"), "core-api-rebuild");
});

test("keeps kiosk mode on the embedded dashboard url", () => {
    assert.equal(
        dashboardSrc("core-api-rebuild"),
        "/grafana/d/core-api-rebuild?kiosk",
    );
});

test("starts every linear time-series y-axis at zero", () => {
    const dir = new URL("../provisioning/dashboards/", import.meta.url);
    const missing = readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) =>
            JSON.parse(readFileSync(new URL(file, dir), "utf8"))
                .panels.filter((panel) => {
                    if (panel.type !== "timeseries") return false;
                    const { min, custom = {} } = panel.fieldConfig.defaults;
                    // Log axes cannot include zero; balances may go negative.
                    return (
                        custom.scaleDistribution?.type !== "log" &&
                        min !== 0 &&
                        custom.axisSoftMin !== 0
                    );
                })
                .map((panel) => `${file}: ${panel.title}`),
        );
    assert.deepEqual(missing, []);
});

test("never reads internal Tinybird pipes, which Grafana's token cannot read", () => {
    const pipesDir = new URL(
        "../../../enter.pollinations.ai/observability/pipes/",
        import.meta.url,
    );
    const pipes = readdirSync(pipesDir)
        .filter((file) => file.endsWith(".pipe"))
        .map((file) => file.slice(0, -".pipe".length));
    assert.ok(pipes.length > 0);
    const dir = new URL("../provisioning/dashboards/", import.meta.url);
    const reads = readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) =>
            JSON.parse(readFileSync(new URL(file, dir), "utf8")).panels.flatMap(
                (panel) =>
                    (panel.targets ?? []).flatMap(({ rawSql = "" }) =>
                        pipes
                            .filter((pipe) =>
                                new RegExp(`\\b${pipe}\\b`).test(rawSql),
                            )
                            .map(
                                (pipe) =>
                                    `${file}: ${panel.title} reads ${pipe}`,
                            ),
                    ),
            ),
        );
    assert.deepEqual(reads, []);
});
