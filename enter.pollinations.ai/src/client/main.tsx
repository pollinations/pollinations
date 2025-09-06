import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { Session, User } from "better-auth";
import { apiKeyClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { hc } from "hono/client";
import {
    type FC,
    type PropsWithChildren,
    StrictMode,
    useEffect,
    useMemo,
} from "react";
import ReactDOM from "react-dom/client";
import type { AppRoutes } from "../index.ts";
import { routeTree } from "./routeTree.gen";

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const authClient = createAuthClient({
    baseURL: import.meta.env.PUBLIC_BASE_URL,
    basePath: import.meta.env.PUBLIC_AUTH_PATH,
    plugins: [apiKeyClient()],
});
export type AuthClient = typeof authClient;

const apiClient = hc<AppRoutes>("/api");
export type ApiClient = (typeof apiClient)["api"];

export type RouterContext = {
    auth: AuthClient;
    api: ApiClient;
    user: User | null;
    session: Session | null;
    isLoading: boolean;
};

const router = createRouter({
    routeTree,
    context: {
        auth: authClient,
        api: apiClient.api,
        user: null,
        session: null,
        isLoading: true,
    },
});

const App: FC<PropsWithChildren> = () => {
    const session = authClient.useSession();

    useEffect(() => {
        if (session.isPending) return;
        router.invalidate();
    }, [session]);

    const context = useMemo(() => {
        return {
            auth: authClient,
            api: apiClient.api,
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
