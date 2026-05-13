import { createRouter, RouterProvider } from "@tanstack/react-router";
import { type FC, type PropsWithChildren, StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const router = createRouter({
    routeTree,
});

// ─── Phase 0: mode toggle wiring ─────────────────────────────
// Default mode is light. Production toggle UI lands with the dark-mode
// launch plan; for now we accept `?mode=dark` so the design showcase
// can preview the dark cascade.
function applyInitialMode(): void {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "dark" ? "dark" : "light";
    document.documentElement.dataset.mode = mode;
}
applyInitialMode();

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
