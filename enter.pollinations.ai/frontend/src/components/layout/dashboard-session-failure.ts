export const DASHBOARD_AUTH_FAILED_MESSAGE = "Authentication failed.";
export const DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE =
    "Service temporarily unavailable.";

/** Copy for a failed dashboard session lookup: a 5xx or a failed fetch means
 * the auth backend is degraded, not that the visitor is signed out. Only an
 * actual rejection is an authentication failure. */
export function dashboardSessionFailureMessage(
    error?: { status?: number } | null,
): string {
    const status = error?.status ?? 0;
    return status >= 500 || status === 0
        ? DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE
        : DASHBOARD_AUTH_FAILED_MESSAGE;
}
