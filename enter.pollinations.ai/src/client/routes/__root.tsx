import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "../contexts/theme-context.tsx";

type RouterContext = {};

export const Route = createRootRouteWithContext<RouterContext>()({
    component: () => (
        <ThemeProvider>
            <Outlet />
            <TanStackRouterDevtools />
        </ThemeProvider>
    ),
});
