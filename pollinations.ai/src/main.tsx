import {
    createRouter,
    RouterProvider,
    stringifySearchWith,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./hooks/useAuth";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const router = createRouter({
    routeTree,
    // Search values stay text: ?q=123 or a prompt such as "true" must not
    // become a number, a boolean or quoted JSON.
    parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
    stringifySearch: stringifySearchWith(JSON.stringify),
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <AuthProvider>
        <RouterProvider router={router} />
    </AuthProvider>,
);
