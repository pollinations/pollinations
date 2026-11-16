import { Button, useColorMode } from "@pollinations/ui";
import { AuthFlowLayout } from "@pollinations/ui/auth";
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Analytics } from "../components/analytics.tsx";
import { metaTags, NOT_FOUND_META, pageMeta } from "../page-meta.ts";

type RouterContext = {};

function RootLayout() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });
    useEffect(() => {
        const meta = pageMeta(pathname) ?? NOT_FOUND_META;
        if (meta === NOT_FOUND_META) document.title = meta.title;
        for (const [tag, key, name, attribute, value] of metaTags(meta)) {
            let element = document.querySelector(`${tag}[${key}="${name}"]`);
            if (value === null) {
                element?.remove();
                continue;
            }
            if (!element) {
                element = document.createElement(tag);
                element.setAttribute(key, name);
                document.head.appendChild(element);
            }
            element.setAttribute(attribute, value);
        }
    }, [pathname]);
    // Keep the browser theme-color meta in sync on every route — not only the
    // ones that mount the dashboard shell / ColorModeToggle. useColorMode's
    // subscribe path derives theme-color from the --polli-color-app-bg token
    // (no hardcoded color) and flips it with the mode.
    useColorMode();
    // Routes declare their document title in `head`; this renders it.
    return (
        <>
            <HeadContent />
            <Analytics />
            <Outlet />
        </>
    );
}

export const Route = createRootRouteWithContext<RouterContext>()({
    component: RootLayout,
    notFoundComponent: () => (
        <AuthFlowLayout
            title="Page not found"
            description={NOT_FOUND_META.description}
            footnote={null}
            actions={
                <Button as="a" href="/">
                    Go to dashboard
                </Button>
            }
        />
    ),
});
