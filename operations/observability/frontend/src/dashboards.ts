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

/**
 * `traffic_group` values of `generation_usage_hourly` (see the Tinybird pipe
 * `generation_events_classified`), plus `all` for both together.
 */
export const TRAFFIC = [
    { value: "everything_else", label: "Everything else" },
    { value: "legacy", label: "Legacy" },
    { value: "all", label: "Both" },
] as const;
export type Traffic = (typeof TRAFFIC)[number]["value"];

export function readTraffic(search: string): Traffic {
    const value = new URLSearchParams(search).get("traffic");
    return (
        TRAFFIC.find((traffic) => traffic.value === value)?.value ??
        "everything_else"
    );
}

/** Users & Balances mixes usage and account panels, so it always excludes legacy. */
export function hasTrafficSelector(uid: string): boolean {
    return uid !== "users-balances-rebuild";
}

/** Kiosk mode hides Grafana's variable controls, so the header passes them. */
export function dashboardSrc(uid: string, traffic: Traffic): string {
    return `/grafana/d/${encodeURIComponent(uid)}?kiosk&var-traffic=${traffic}`;
}
