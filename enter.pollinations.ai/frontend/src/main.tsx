import { createRouter, RouterProvider } from "@tanstack/react-router";
import { type FC, type PropsWithChildren, StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { LoadError } from "./components/layout/dashboard-loading.tsx";
import { DashboardPending } from "./components/layout/dashboard-pending.tsx";
import {
    DASHBOARD_AUTH_FAILED_MESSAGE,
    DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
} from "./components/layout/dashboard-session-failure.ts";
import { config } from "./config";
import { routeTree } from "./routeTree.gen";

const ref = new URLSearchParams(window.location.search).get("ref");
if (
    ref === "image" ||
    ref === "text" ||
    ref === "agent_low_balance_topup" ||
    ref === "agent_low_balance_quests" ||
    ref === "agent_key_budget" ||
    ref === "agent_grant"
) {
    navigator.sendBeacon(`${config.apiBaseUrl}/referral?ref=${ref}`);
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

// Only route-thrown failures with reviewed copy reach the visitor; anything
// else keeps the generic message instead of leaking internals.
const ROUTE_ERROR_MESSAGES = [
    DASHBOARD_AUTH_FAILED_MESSAGE,
    DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
];

const router = createRouter({
    routeTree,
    defaultErrorComponent: ({ error }) => (
        <div className="p-6">
            <LoadError onRetry={() => router.invalidate()}>
                {error instanceof Error &&
                ROUTE_ERROR_MESSAGES.includes(error.message)
                    ? error.message
                    : "Couldn’t load this page."}
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
