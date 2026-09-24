export const TRAFFIC_GROUPS = [
    { value: "non_legacy", label: "Everything else" },
    { value: "legacy", label: "Legacy public APIs" },
    { value: "all", label: "Both" },
] as const;

export type TrafficGroup = (typeof TRAFFIC_GROUPS)[number]["value"];

export function isTrafficGroup(value: string | null): value is TrafficGroup {
    return TRAFFIC_GROUPS.some((group) => group.value === value);
}

/**
 * Dashboard list for the header picker.
 *
 * Grafana is embedded in kiosk mode, so its own navigation is hidden and this
 * app owns switching between dashboards.
 */

/** Grafana `/api/search` returns more fields; these are the ones used here. */
export type SearchResult = {
    uid?: string;
    title?: string;
    folderUid?: string;
};

export type Dashboard = {
    uid: string;
    title: string;
};

/**
 * Matches `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH` in `src/index.js`, so a
 * visit with no dashboard in the URL shows the same overview as before.
 */
export const DEFAULT_DASHBOARD_UID = "platform-usage-rebuild";

/**
 * Current dashboards are the ones provisioned at the top level of
 * `provisioning/dashboards/`; `foldersFromFilesStructure` puts everything under
 * `legacy/` into a Grafana folder. Reading the folder keeps the picker in step
 * with the repository instead of a second hand-maintained list.
 */
export function currentDashboards(results: SearchResult[]): Dashboard[] {
    const dashboards: Dashboard[] = [];
    for (const { uid, title, folderUid } of results) {
        if (uid && title && !folderUid) dashboards.push({ uid, title });
    }
    return dashboards.sort((left, right) =>
        left.title.localeCompare(right.title),
    );
}

export function readDashboardUid(search: string): string {
    return new URLSearchParams(search).get("d") || DEFAULT_DASHBOARD_UID;
}

export function dashboardSrc(uid: string, trafficGroup = "non_legacy"): string {
    return `/grafana/d/${encodeURIComponent(uid)}?kiosk&var-traffic_group=${encodeURIComponent(trafficGroup)}`;
}

export function readTrafficGroup(search: string): TrafficGroup {
    const value = new URLSearchParams(search).get("traffic");
    return isTrafficGroup(value) ? value : "non_legacy";
}
