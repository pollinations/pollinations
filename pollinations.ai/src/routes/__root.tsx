import { Button, ContentHeader, cn } from "@pollinations/ui";
import {
    createRootRoute,
    HeadContent,
    Outlet,
    useRouterState,
} from "@tanstack/react-router";
import { NOT_FOUND_META } from "../routeMeta";
import { pageCardClassName } from "../ui/site/PageCard";
import { SiteFooter } from "../ui/site/SiteFooter";
import { SiteHeader } from "../ui/site/SiteHeader";

export const Route = createRootRoute({
    head: () => ({
        meta: [
            { title: NOT_FOUND_META.title },
            { name: "description", content: NOT_FOUND_META.description },
        ],
    }),
    component: RootLayout,
    notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
    return (
        <section className="flex min-h-[28rem] flex-col justify-center gap-8">
            <ContentHeader
                eyebrow="404"
                title="That page flew away."
                subtitle="The link may be outdated, or the page may have moved."
                variant="page"
            />
            <div>
                <Button as="a" href="/" appearance="raised">
                    Back to Pollinations
                </Button>
            </div>
        </section>
    );
}

/**
 * One sheet and one vertical beat by default, owned here rather than repeated
 * per route. Play opts into two sibling sheets because its hero and workspace
 * are separate pieces of the interface.
 *
 * The gap lives on this flex column, so sections carry no spacing of their
 * own.
 *
 * The desktop nav sits on the desk, outside the card. On phones, only its menu
 * control floats over the sheet and takes no layout space. The chrome hides on
 * the way down and returns on the way up, so it rarely overlaps content unless
 * that was the gesture asking for it.
 *
 * Site chrome stays here rather than in @pollinations/ui: a marketing top bar
 * and enter's 240px dashboard rail are different information architectures.
 * The one thing borrowed from DashboardShell is its seam — chrome takes
 * children, never auth state, which is what keeps this site SDK-free.
 */
function RootLayout() {
    const isPlay = useRouterState({
        select: (state) => state.location.pathname === "/play",
    });

    return (
        <div className="flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <HeadContent />
            <SiteHeader />
            <div className="site-shell mb-6 flex flex-1 flex-col pt-4 min-[700px]:pt-0">
                <main
                    className={cn(
                        "flex flex-1 flex-col",
                        isPlay ? "gap-6" : pageCardClassName,
                    )}
                >
                    <Outlet />
                </main>
            </div>
            <SiteFooter />
        </div>
    );
}
