import { createRootRoute, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "../ui/site/SiteFooter";
import { SiteHeader } from "../ui/site/SiteHeader";

export const Route = createRootRoute({
    component: RootLayout,
});

/**
 * One sheet, owned here rather than repeated per route.
 *
 * The nav lives *inside* the card as its top row. A floating island on top of
 * a floating sheet was two competing elevations for one idea, and the earlier
 * full-bleed bar cut content because it was a different colour from the sheet
 * it overlapped. Cream on cream removes the boundary entirely — content
 * passing under the nav reads as the card's own header staying put.
 *
 * Site chrome stays here rather than in @pollinations/ui: a marketing top bar
 * and enter's 240px dashboard rail are different information architectures.
 * The one thing borrowed from DashboardShell is its seam — chrome takes
 * children, never auth state, which is what keeps this site SDK-free.
 */
function RootLayout() {
    return (
        <div className="flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <main className="m-6 flex-1 rounded-[28px] bg-theme-bg-pale shadow-container">
                <SiteHeader />
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
