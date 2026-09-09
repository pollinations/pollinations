import "@pollinations/ui/app.css";
import { signIn, signOut, useDashboardSession } from "@pollinations/auth/react";
import { Alert, AppHeader, ColorModeToggle, Text } from "@pollinations/ui";
import { DashboardAccountMenu, DashboardSignIn } from "@pollinations/ui/auth";
import { createRoot } from "react-dom/client";

function App() {
    const { user, isPending, error } = useDashboardSession();
    if (isPending)
        return (
            <main>
                <Text>Checking sign-in…</Text>
            </main>
        );
    if (error)
        return (
            <main>
                <Alert>{error}</Alert>
            </main>
        );
    if (!user)
        return <DashboardSignIn appName="Observability" onSignIn={signIn} />;
    return (
        <div className="flex h-dvh flex-col bg-app-bg">
            <AppHeader navLabel="Observability links">
                <ColorModeToggle />
                <DashboardAccountMenu user={user} onSignOut={signOut} />
            </AppHeader>
            <iframe
                className="min-h-0 w-full flex-1 border-0"
                title="Observability dashboards"
                src="/grafana/?kiosk"
            />
        </div>
    );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
