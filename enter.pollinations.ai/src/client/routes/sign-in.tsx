import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { Button } from "../components/button.tsx";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import {
    DASHBOARD_NAV_ITEMS,
    isDashboardPage,
} from "../components/layout/dashboard-theme.ts";
import { Models } from "../components/models";
import { NewsFaq } from "../components/news-faq";

const SIGNED_OUT_PAGES: ReadonlySet<DashboardPage> = new Set([
    "news-faq",
    "models",
]);

const SIGNED_OUT_NAV_ITEMS = DASHBOARD_NAV_ITEMS.filter((item) =>
    SIGNED_OUT_PAGES.has(item.id),
);

function pageFromHash(hash: string): DashboardPage {
    const page = hash.replace(/^#/, "");
    if (isDashboardPage(page) && SIGNED_OUT_PAGES.has(page)) return page;
    if (page === "news" || page === "faq" || page === "updates")
        return "news-faq";
    if (page === "pricing") return "models";
    return "news-faq";
}

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.data?.user) {
            // Check for pending redirect URL from authorize flow
            const pendingRedirectUrl =
                typeof window !== "undefined"
                    ? localStorage.getItem("pending_redirect_url")
                    : null;

            if (pendingRedirectUrl) {
                // Clear the stored URL and redirect to authorize
                localStorage.removeItem("pending_redirect_url");
                throw redirect({
                    to: "/authorize",
                    search: {
                        redirect_url: pendingRedirectUrl,
                        models: null,
                        budget: null,
                        expiry: null,
                        scope: null,
                    },
                });
            }
            throw redirect({ to: "/" });
        }
    },
});

function RouteComponent() {
    const [loading, setLoading] = useState(false);
    const [activePage, setActivePage] = useState<DashboardPage>(() =>
        pageFromHash(typeof window === "undefined" ? "" : window.location.hash),
    );

    useEffect(() => {
        function syncPageFromHash(): void {
            setActivePage(pageFromHash(window.location.hash));
        }

        window.addEventListener("hashchange", syncPageFromHash);
        return () => window.removeEventListener("hashchange", syncPageFromHash);
    }, []);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await authClient.signIn.social({
            provider: "github",
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    function handlePageChange(page: DashboardPage): void {
        setActivePage(page);
        try {
            history.replaceState(null, "", `#${page}`);
        } catch {
            // Hash updates are cosmetic; navigation still works without them.
        }
        window.scrollTo({ top: 0, behavior: "auto" });
    }

    return (
        <DashboardShell
            activePage={activePage}
            navItems={SIGNED_OUT_NAV_ITEMS}
            onPageChange={handlePageChange}
            accountArea={
                <SignedOutAccountArea
                    loading={loading}
                    onSignIn={handleSignIn}
                />
            }
        >
            {activePage === "news-faq" && <NewsFaq />}
            {activePage === "models" && <Models />}
        </DashboardShell>
    );
}

function SignedOutAccountArea({
    loading,
    onSignIn,
}: {
    loading: boolean;
    onSignIn: () => void;
}) {
    return (
        <Button
            as="button"
            onClick={onSignIn}
            disabled={loading}
            theme="amber"
            className="w-full justify-center text-center"
        >
            {loading ? "Signing in..." : "Sign in with GitHub"}
        </Button>
    );
}
