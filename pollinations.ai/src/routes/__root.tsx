import { useColorMode } from "@pollinations/ui";
import {
    createRootRoute,
    HeadContent,
    Outlet,
    useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { BeeFlyby } from "../components/bee/PolliBee.tsx";
import { Footer } from "../components/shell/Footer.tsx";
import { Header } from "../components/shell/Header.tsx";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ title: "pollinations.ai" }],
    }),
    component: RootLayout,
});

/** First path segment → html[data-route] so alive.css can map page → hue. */
function useRouteAccent() {
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    useEffect(() => {
        document.documentElement.dataset.route =
            pathname.split("/")[1] || "home";
    }, [pathname]);
}

function RootLayout() {
    useColorMode();
    useRouteAccent();

    return (
        <div className="flex h-full min-w-0 flex-col">
            <HeadContent />
            {/* Shell body is overflow-hidden; this <main> is the scroll owner. */}
            <main
                id="app-scroll"
                className="flex-1 overflow-x-hidden overflow-y-auto bg-app-bg"
            >
                <Header />
                <div className="flex min-h-full min-w-0 flex-col">
                    <div className="min-w-0 flex-1">
                        <Outlet />
                    </div>
                    <Footer />
                </div>
            </main>
            <BeeFlyby />
        </div>
    );
}
