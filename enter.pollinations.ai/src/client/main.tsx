import { createRouter, RouterProvider } from "@tanstack/react-router";
import { apiKeyClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { hc } from "hono/client";
import {
    type FC,
    type PropsWithChildren,
    StrictMode,
    useMemo,
} from "react";
import ReactDOM from "react-dom/client";
import type { AppRoutes } from "../index.ts";
import { routeTree } from "./routeTree.gen";
import { config } from "./config.ts";
import { createAuth } from "@/auth.ts";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const authClient = createAuthClient({
    baseURL: config.baseUrl,
    basePath: config.authPath,
    plugins: [
        apiKeyClient(),
        inferAdditionalFields<ReturnType<typeof createAuth>>(),
    ],
});
export type AuthClient = typeof authClient;
export type ClientSession = AuthClient["$Infer"]["Session"];
export type Session = ClientSession["session"];
export type User = ClientSession["user"];

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
