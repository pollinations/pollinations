import {
    createDashboardActions,
    type DashboardAuthRuntime,
    useDashboardSession,
} from "@pollinations/auth/react";
import { AppHeader, ColorModeToggle, useColorMode } from "@pollinations/ui";
import { DashboardAccountMenu, DashboardSignIn } from "@pollinations/ui/auth";
import { createRoot } from "react-dom/client";
import "@frontend/style.css";

const runtime: DashboardAuthRuntime = {
    fetch: (input, init) => fetch(input, init),
    location: () => new URL(location.href),
    navigate: (destination) => {
        const url = new URL(destination, location.origin);
        if (url.origin === location.origin && url.pathname === "/")
            url.pathname = "/connect-admin.html";
        location.assign(url.href);
    },
};
const actions = createDashboardActions(runtime);
function AdminExample() {
    useColorMode();
    const { user, isPending, error } = useDashboardSession(runtime);
    if (!user)
        return (
            <DashboardSignIn
                appName="Admin example"
                onSignIn={actions.signIn}
                isPending={isPending}
                error={error}
            />
        );
    return (
        <main className="min-h-screen" data-admin-connected="true">
            <AppHeader navLabel="Admin example links">
                <ColorModeToggle />
                <DashboardAccountMenu
                    user={user}
                    className="polli:max-w-64 polli:shrink-0"
                    onSignOut={actions.signOut}
                />
            </AppHeader>
        </main>
    );
}
const element = document.getElementById("root");
if (!element) throw new Error("Missing admin example root");
createRoot(element).render(<AdminExample />);

// Resume Connect review actions after real route/callback navigation.
void import("./review-driver").then(({ runReviewSteps }) => runReviewSteps());
