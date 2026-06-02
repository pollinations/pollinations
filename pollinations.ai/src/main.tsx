import { PolliProvider } from "@pollinations/sdk/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { POLLI_APP_KEY } from "./config.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./style.css";

const router = createRouter({
    routeTree,
    defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <StrictMode>
        <PolliProvider
            appKey={POLLI_APP_KEY}
            permissions={["profile", "usage"]}
        >
            <RouterProvider router={router} />
        </PolliProvider>
    </StrictMode>,
);
