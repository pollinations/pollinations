import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { NOT_FOUND_META } from "../routeMeta";
import { ActionButton, PageHeader, SHELL } from "../ui/site/kit";
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
            <PageHeader
                eyebrow="404"
                title="That page flew away."
                subtitle="The link may be outdated, or the page may have moved."
            />
            <div>
                <ActionButton href="/">Back to Pollinations</ActionButton>
            </div>
        </section>
    );
}

/**
 * One sheet and one vertical beat, owned here rather than repeated per route.
 *
 * The gap lives on this flex column, so sections carry no spacing of their
 * own. Before, Hello ran 64 / 72 / 64 / 64 / 0 as per-section bottom padding
 * while Apps used gap-14 and Play gap-10 — five values in five files, which
 * is what made a long page feel unstructured.
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
    return (
        <div className="flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base">
            <HeadContent />
            <SiteHeader />
            <div
                className={`${SHELL} mb-6 flex flex-1 flex-col pt-4 min-[700px]:pt-0`}
            >
                <main className="flex flex-1 flex-col gap-12 overflow-clip rounded-[28px] bg-theme-bg-pale px-4 py-10 shadow-container sm:gap-18 sm:px-8 sm:py-16 md:px-18">
                    <Outlet />
                </main>
            </div>
            <SiteFooter />
        </div>
    );
}
