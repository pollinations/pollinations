import { createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

// The Worker supplies metadata for crawlers. Hand ownership to the router
// before mounting so client navigation cannot retain the initial page's tags.
for (const tag of document.head.querySelectorAll("[data-route-meta]")) {
    tag.remove();
}

createRoot(rootElement).render(<RouterProvider router={router} />);
