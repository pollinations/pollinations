import { createRootRoute, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "../ui/site/SiteFooter";
import { SiteHeader } from "../ui/site/SiteHeader";

export const Route = createRootRoute({
    component: RootLayout,
});

/**
 * Site chrome lives here rather than in @pollinations/ui: a marketing top bar
 * and enter's 240px dashboard rail are different information architectures,
 * and merging them produces a props-soup component. The one thing borrowed
 * from DashboardShell is its seam — chrome takes children, never auth state,
 * which is what keeps this site SDK-free.
 */
function RootLayout() {
    return (
        <div className="flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <SiteHeader />
            <main className="flex-1">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
