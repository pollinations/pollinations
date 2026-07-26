import { createRootRoute, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "../ui/site/SiteFooter";
import { SiteHeader } from "../ui/site/SiteHeader";

export const Route = createRootRoute({
    component: RootLayout,
});

/**
 * One sheet, owned here rather than repeated per route.
 *
 * The nav sits on the desk, outside the card. What stops it cutting content
 * is that it hides on the way down and only returns on the way up — so it is
 * almost never overlapping something you are reading, and when it is, that
 * was the gesture asking for it. A shadow appears only once it is over
 * content, so the overlap reads as layering rather than a slice.
 *
 * Site chrome stays here rather than in @pollinations/ui: a marketing top bar
 * and enter's 240px dashboard rail are different information architectures.
 * The one thing borrowed from DashboardShell is its seam — chrome takes
 * children, never auth state, which is what keeps this site SDK-free.
 */
function RootLayout() {
    return (
        <div className="flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <SiteHeader />
            <main className="mx-6 mb-6 flex-1 rounded-[28px] bg-theme-bg-pale px-8 py-14 shadow-container md:px-18">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
