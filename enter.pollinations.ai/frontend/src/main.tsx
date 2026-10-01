import { createRouter, RouterProvider } from "@tanstack/react-router";
import { type FC, type PropsWithChildren, StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { LoadError } from "./components/layout/dashboard-loading.tsx";
import { DashboardPending } from "./components/layout/dashboard-pending.tsx";
import { config } from "./config";
import { routeTree } from "./routeTree.gen";

const ref = new URLSearchParams(window.location.search).get("ref");
if (
    ref === "image" ||
    ref === "agent_low_balance_topup" ||
    ref === "agent_low_balance_quests" ||
    ref === "agent_key_budget"
) {
    navigator.sendBeacon(`${config.apiBaseUrl}/referral?ref=${ref}`);
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const router = createRouter({
    routeTree,
    defaultErrorComponent: () => (
        <div className="p-6">
            <LoadError onRetry={() => router.invalidate()}>
                Couldn’t load this page.
            </LoadError>
        </div>
    ),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: DashboardPending,
});

const App: FC<PropsWithChildren> = () => {
    return <RouterProvider router={router} />;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element");

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
