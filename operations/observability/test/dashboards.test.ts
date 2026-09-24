import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

for (const name of [
    "platform-usage-rebuild",
    "core-api-rebuild",
    "community-models-rebuild",
    "byop-apps-rebuild",
    "users-balances-rebuild",
]) {
    test(`${name} keeps regular usage fixed in every aggregate query`, () => {
        const source = readFileSync(
            new URL(`../provisioning/dashboards/${name}.json`, import.meta.url),
            "utf8",
        );
        const queries: string[] = [];
        JSON.parse(source, (key, value) => {
            if (key === "rawSql") queries.push(value);
            return value;
        });
        assert.ok(queries.length > 0);
        for (const query of queries) {
            const sources =
                query.match(
                    /(?:FROM|JOIN) (generation_usage_hourly|byop_app_daily|user_first_activity_mv|generation_events_classified)\b/g,
                ) ?? [];
            const filters = query.match(/\btraffic_group = 'regular'/g) ?? [];
            assert.equal(filters.length, sources.length, query);
            // Raw events would bypass the shared key classification.
            assert.doesNotMatch(query, /\bFROM generation_event_v2\b/);
        }
        // Old URL variables cannot widen the population inside a dashboard.
        assert.ok(!source.includes("${traffic_group"));
        assert.ok(!source.includes('"name": "traffic_group"'));
    });
}
