import { AuthModalLoading } from "@pollinations/ui/auth";
import { useRouterState } from "@tanstack/react-router";
import { DashboardLoading } from "./dashboard-loading.tsx";
import { DashboardShell } from "./dashboard-shell.tsx";

const pageSections: Record<string, readonly string[]> = {
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
    "/app/sign-in": "Sign in",
    "/authorize": "Connect",
    "/device": "Allow your device",
    "/edit-key": "Edit key",
    "/top-up": "Top-up",
};

/** Route-level loading uses the same cards as section-level loading. */
export function DashboardPending() {
    const { location, dashboardReady } = useRouterState({
        select: (state) => ({
            location: state.location,
            dashboardReady: state.matches.some(
                (match) =>
                    match.routeId === "/_dashboard" &&
                    match.status === "success",
            ),
        }),
    });
    let titles = pageSections[location.pathname];
    if (!titles) {
        return (
            <AuthModalLoading
                title={authTitles[location.pathname] ?? "Loading"}
            />
        );
    }
    if (location.pathname === "/models") {
        const category = location.search.category;
        titles = [
            category === "agent"
                ? "Agents"
                : category === "mcp"
                  ? "MCP"
                  : "Models",
        ];
    }
    const content = (
        <div className="flex flex-col gap-6">
            {titles.map((title) => (
                <DashboardLoading key={title} title={title} label="Loading…" />
            ))}
        </div>
    );
    // A child route waits inside the existing shell; the session check does not.
    return dashboardReady ? (
        content
    ) : (
        <DashboardShell showFooterLinks={false}>{content}</DashboardShell>
    );
}
