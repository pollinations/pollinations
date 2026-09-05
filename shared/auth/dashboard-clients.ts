// Public client identifiers, not credentials. Only these first-party dashboards
// may request identity-only login; their registered redirects are still checked.
export const DASHBOARD_CLIENT_IDS = [
    "pk_LBL0KnkHI6AZopCc", // Economics
    "pk_Bxny9FSNDpousKqW", // KPI
    "pk_vVa38CFt1R1gGScW", // Observability
] as const;

export function isDashboardClient(clientId: string | undefined): boolean {
    return DASHBOARD_CLIENT_IDS.some((id) => id === clientId);
}
