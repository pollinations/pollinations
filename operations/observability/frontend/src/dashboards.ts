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

/** Header range choices, each ending with the last complete UTC day. */
export const RANGE_LABELS = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
} as const;

export type Range = keyof typeof RANGE_LABELS;

/** Matches the `time` every provisioned dashboard saves. */
export const DEFAULT_RANGE: Range = "30d";

/**
 * The dashboards Grafana has provisioned from `provisioning/dashboards/`,
 * sorted by title. Reading Grafana's list keeps the picker in step with the
 * repository instead of a second hand-maintained list.
 */
export function currentDashboards(results: SearchResult[]): Dashboard[] {
    const dashboards: Dashboard[] = [];
    for (const { uid, title } of results) {
        if (uid && title) dashboards.push({ uid, title });
    }
    return dashboards.sort((left, right) =>
        left.title.localeCompare(right.title),
    );
}

export function readDashboardUid(search: string): string {
    return new URLSearchParams(search).get("d") || DEFAULT_DASHBOARD_UID;
}

export function readRange(search: string): Range {
    const range = new URLSearchParams(search).get("range") ?? "";
    return Object.hasOwn(RANGE_LABELS, range)
        ? (range as Range)
        : DEFAULT_RANGE;
}

/**
 * Kiosk mode hides Grafana's navigation and time picker, so the range travels
 * in the URL, where `from`/`to` override the dashboard's saved time.
 */
export function dashboardSrc(uid: string, range: Range): string {
    return `/grafana/d/${encodeURIComponent(uid)}?kiosk&from=now-${range}/d&to=now-1d/d`;
}
