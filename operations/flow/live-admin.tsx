import { signIn, signOut, useDashboardSession } from "@pollinations/auth/react";
import { AppHeader, ColorModeToggle, useColorMode } from "@pollinations/ui";
import { DashboardAccountMenu, DashboardSignIn } from "@pollinations/ui/auth";
import { createRoot } from "react-dom/client";
import "@frontend/style.css";
import "./admin-frame";

function AdminExample() {
    useColorMode();
    const { user, isPending, error } = useDashboardSession();
    if (!user)
        return (
            <DashboardSignIn
                appName="Admin example"
                onSignIn={signIn}
                isPending={isPending}
                sessionError={error}
            />
        );
    return (
        <main className="min-h-screen" data-admin-connected="true">
            <AppHeader navLabel="Admin example links">
                <ColorModeToggle />
                <DashboardAccountMenu
                    user={user}
                    className="polli:max-w-64 polli:shrink-0"
                    onSignOut={signOut}
                />
            </AppHeader>
        </main>
    );
}
const element = document.getElementById("root");
if (!element) throw new Error("Missing admin example root");
createRoot(element).render(<AdminExample />);

// Resume Flow review actions after real route/callback navigation.
void import("./review-driver").then(({ runReviewSteps }) => runReviewSteps());
