import { createRouter, RouterProvider } from "@tanstack/react-router";
import { type FC, type PropsWithChildren, StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { config } from "./config";
import { routeTree } from "./routeTree.gen";

const ref = new URLSearchParams(window.location.search).get("ref");
if (ref === "image") {
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
