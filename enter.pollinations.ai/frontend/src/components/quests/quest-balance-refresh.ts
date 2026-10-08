import type { useRouter } from "@tanstack/react-router";

type Router = ReturnType<typeof useRouter>;

// The dashboard layout route whose loader produces the sidebar balance. Kept
// as the literal id (same string useLoaderData({ from: "/_dashboard" }) uses)
// so this leaf module does not drag the route module - and its api.ts /
// window dependencies - into every import.
export const DASHBOARD_ROUTE_ID = "/_dashboard";

// A successful quest claim credits the wallet, but the sidebar balance comes
// from the dashboard loader, which nothing refreshed until the next
// navigation. Re-run that loader (synchronously, like useDashboardRetry) and
// await the balance promise it returns un-awaited. Call this only after a
// successful claim response: a failed claim must not refresh as if credited,
// and the refresh must not depend on the quest-list reload succeeding.
export async function refreshDashboardBalanceAfterClaim(
    router: Router,
): Promise<void> {
    await router.invalidate({
        filter: (match) => match.routeId === DASHBOARD_ROUTE_ID,
        sync: true,
    });
    await router.state.matches.find(
        (match) => match.routeId === DASHBOARD_ROUTE_ID,
    )?.loaderData?.balance;
}
