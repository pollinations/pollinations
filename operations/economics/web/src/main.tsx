import "./app.css";
import { Text } from "@pollinations/ui";
import { DashboardSignIn } from "@pollinations/ui/auth";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { signIn, useDashboardSession } from "./auth";

// The dashboard imports the private provider registry. Load it only after the
// app session is established; the Worker protects that chunk independently.
const Dashboard = lazy(() => import("./App"));
function App() {
    const { user, isPending, error } = useDashboardSession();
    if (!user)
        return (
            <DashboardSignIn
                appName="Economics"
                onSignIn={signIn}
                isPending={isPending}
                error={error}
            />
        );
    return (
        <Suspense fallback={<Text>Loading Economics…</Text>}>
            <Dashboard accountUser={user} />
        </Suspense>
    );
}
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
