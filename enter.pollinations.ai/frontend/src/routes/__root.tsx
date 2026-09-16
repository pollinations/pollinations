import { useColorMode } from "@pollinations/ui";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

type RouterContext = {};

function RootLayout() {
    // Keep the browser theme-color meta in sync on every route — not only the
    // ones that mount the dashboard shell / ColorModeToggle. useColorMode's
    // subscribe path derives theme-color from the --polli-color-app-bg token
    // (no hardcoded color) and flips it with the mode.
    useColorMode();
    return <Outlet />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
    component: RootLayout,
});
