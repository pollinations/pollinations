import assert from "node:assert/strict";
import test from "node:test";
import {
    currentDashboards,
    DEFAULT_DASHBOARD_UID,
    dashboardSrc,
    readDashboardUid,
    readTrafficGroup,
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
        "/grafana/d/core-api-rebuild?kiosk&var-traffic_group=regular",
    );
});

test("passes each selected traffic group to the embedded dashboard", () => {
    for (const group of ["regular", "legacy", "internal", "all"]) {
        const url = new URL(
            dashboardSrc("core-api-rebuild", group),
            "https://observability.test",
        );
        assert.equal(url.searchParams.get("var-traffic_group"), group);
        assert.equal(url.searchParams.has("kiosk"), true);
    }
});

test("restores traffic deep links and rejects unsupported groups", () => {
    assert.equal(readTrafficGroup("?traffic=internal"), "internal");
    assert.equal(readTrafficGroup("?traffic=legacy"), "legacy");
    assert.equal(readTrafficGroup("?traffic=all"), "all");
    assert.equal(readTrafficGroup("?traffic=invalid"), "regular");
    assert.equal(readTrafficGroup(""), "regular");
});
