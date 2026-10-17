import "./app.css";
import { Text } from "@pollinations/ui";
import { DashboardSignIn } from "@pollinations/ui/auth";
import { type ComponentProps, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { signIn, useDashboardSession } from "./auth";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Read the private vendor journals before importing any calculations.
const Dashboard = lazy(async () => {
    try {
        const response = await fetch("/api/economics/vendor-journals", {
            credentials: "same-origin",
        });
        if (!response.ok)
            throw new Error(
                "Vendor journals could not be loaded from Drive. Reload to retry.",
            );
        const { initializeProviderRegistry } = await import(
            "./lib/providerRegistry"
        );
        const snapshot = (await response.json()) as {
            vendorDetails: unknown;
            planning: unknown;
        };
        initializeProviderRegistry(snapshot.vendorDetails);
        const { parsePlanningDocument } = await import("./lib/planning");
        const planningDocument = parsePlanningDocument(snapshot.planning);
        const { default: Economics } = await import("./App");
        return {
            default: (
                props: Omit<
                    ComponentProps<typeof Economics>,
                    "planningDocument"
                >,
            ) => <Economics {...props} planningDocument={planningDocument} />,
        };
    } catch (error) {
        const { SourceRecovery } = await import("./components/SourceRecovery");
        const reason =
            error instanceof Error
                ? error.message
                : "Vendor journals are unavailable.";
        return { default: () => <SourceRecovery reason={reason} /> };
    }
});
function App() {
    const { user, isPending, error } = useDashboardSession();
    if (isPending || error || !user)
        return (
            <DashboardSignIn
                appName="Economics"
                onSignIn={signIn}
                isPending={isPending}
                sessionError={error}
            />
        );
    return (
        <ErrorBoundary resetKey={user.email}>
            <Suspense fallback={<Text>Loading Economics…</Text>}>
                <Dashboard accountUser={user} />
            </Suspense>
        </ErrorBoundary>
    );
}
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
