import { createRouter, RouterProvider } from "@tanstack/react-router";
import { createAuthClient } from "better-auth/react";
import {
    type FC,
    type PropsWithChildren,
    StrictMode,
    useMemo,
    useEffect,
} from "react";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { hc } from "hono/client";
import type { AppRoutes } from "../index.ts";
import type { Session, User } from "better-auth";

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const auth = createAuthClient({
    baseURL: import.meta.env.PUBLIC_BASE_URL,
    basePath: import.meta.env.PUBLIC_AUTH_PATH,
});

const api = hc<AppRoutes>("/api");

export type RouterContext = {
    auth: typeof auth;
    api: typeof api;
    user: User | null;
    session: Session | null;
    isLoading: boolean;
};

const router = createRouter({
    routeTree,
    context: {
        auth,
        api,
        user: null,
        session: null,
        isLoading: true,
    },
});

const App: FC<PropsWithChildren> = () => {
    const session = auth.useSession();

    useEffect(() => {
        if (session.isPending) return;
        router.invalidate();
    }, [session]);

    const context = useMemo(() => {
        return {
            auth,
            api,
            user: session.data?.user || null,
            session: session.data?.session || null,
            isLoading: session.isPending,
        };
    }, [session]);

    return <RouterProvider router={router} context={context} />;
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
