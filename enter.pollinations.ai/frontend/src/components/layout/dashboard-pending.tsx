import { AuthModalLoading } from "@pollinations/ui/auth";
import { useRouterState } from "@tanstack/react-router";
import { PageLoading } from "./dashboard-loading.tsx";
import { DashboardShell } from "./dashboard-shell.tsx";

const pageTitles: Record<string, readonly string[]> = {
    "/news": ["Announcements", "News", "FAQ"],
    "/models": ["Models"],
    "/my-models": ["Agents", "Models"],
    "/keys": ["Secrets", "Apps"],
    "/pollen": ["Wallet", "Top-up"],
    "/activity": ["Usage", "Earnings", "Last events"],
    "/quests": ["Claimed"],
    "/account": [
        "Profile",
        "Community",
        "Connected apps",
        "Need help?",
        "Delete account",
    ],
};

const authTitles: Record<string, string> = {
    "/sign-in": "Sign in",
    "/app/sign-in": "Sign in to Pollinations",
    "/authorize": "Connect",
    "/device": "Allow your device",
    "/edit-key": "Edit key",
    "/top-up": "Top-up",
};

export function DashboardPending() {
    const { pathname, dashboardReady } = useRouterState({
        select: (state) => ({
            pathname: state.location.pathname,
            dashboardReady: state.matches.some(
                (match) =>
                    match.routeId === "/_dashboard" &&
                    match.status === "success",
            ),
        }),
    });
    const titles = pageTitles[pathname];
    if (!titles) {
        const title = authTitles[pathname];
        return title ? <AuthModalLoading title={title} /> : null;
    }
    const content = <PageLoading titles={titles} />;
    // A child route waits inside the existing shell; the session check does not.
    return dashboardReady ? (
        content
    ) : (
        <DashboardShell showFooterLinks={false}>{content}</DashboardShell>
    );
}
