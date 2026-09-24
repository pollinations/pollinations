import assert from "node:assert/strict";
import test from "node:test";
import {
    currentDashboards,
    DEFAULT_DASHBOARD_UID,
    dashboardSrc,
    readDashboardUid,
    readTraffic,
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
        dashboardSrc("core-api-rebuild", "legacy"),
        "/grafana/d/core-api-rebuild?kiosk&var-traffic=legacy",
    );
});

test("defaults to everything except legacy and rejects unknown values", () => {
    assert.equal(readTraffic(""), "everything_else");
    assert.equal(readTraffic("?traffic=all"), "all");
    assert.equal(readTraffic("?traffic=internal"), "everything_else");
});
