import "@pollinations/ui/app.css";
import { signIn, signOut, useDashboardSession } from "@pollinations/auth/react";
import {
    AccountMenu,
    Alert,
    AppHeader,
    ColorModeToggle,
    DropdownItem,
    SignOutIcon,
    Text,
} from "@pollinations/ui";
import { DashboardSignIn } from "@pollinations/ui/auth";
import { useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
    const { user, isPending, error } = useDashboardSession();
    const [logoutError, setLogoutError] = useState<string | null>(null);
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
                <AccountMenu
                    name={user.name || user.email}
                    avatarUrl={user.picture}
                    menuClassName="polli:w-max polli:min-w-0"
                >
                    <DropdownItem
                        onClick={() => {
                            setLogoutError(null);
                            void signOut().catch((error: Error) =>
                                setLogoutError(error.message),
                            );
                        }}
                    >
                        <SignOutIcon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                        />
                        Sign out
                    </DropdownItem>
                </AccountMenu>
            </AppHeader>
            {logoutError && <Alert>{logoutError}</Alert>}
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
