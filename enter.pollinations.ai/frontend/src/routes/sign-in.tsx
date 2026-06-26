import { Button, GitHubIcon } from "@pollinations/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../auth.ts";
import { dashboardPageFromHash } from "../components/layout/dashboard-routing.ts";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import { DASHBOARD_NAV_ITEMS } from "../components/layout/dashboard-theme.ts";
import { usePageFromHash } from "../components/layout/use-page-from-hash.ts";
import { Models } from "../components/models";
import { NewsFaq } from "../components/news-faq";
import { QuestOverview } from "../components/quests";

const SIGNED_OUT_PAGES: ReadonlySet<DashboardPage> = new Set([
    "news-faq",
    "models",
    "quests",
]);

const SIGNED_OUT_NAV_ITEMS = DASHBOARD_NAV_ITEMS.filter((item) =>
    SIGNED_OUT_PAGES.has(item.id),
);

function pageFromHash(hash: string): DashboardPage {
    return dashboardPageFromHash(hash, {
        allowedPages: SIGNED_OUT_PAGES,
        fallbackPage: "news-faq",
    });
}

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.data?.user) {
            // Check for pending redirect URL from authorize flow
            const pendingRedirectUrl = localStorage.getItem(
                "pending_redirect_url",
            );

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
            throw redirect({
                to: "/",
                hash: window.location.hash.slice(1) || undefined,
            });
        }
    },
});

function dashboardCallbackUrl(activePage: DashboardPage): string {
    const url = new URL("/", window.location.href);
    url.hash = window.location.hash.slice(1) || activePage;
    return url.href;
}

function RouteComponent() {
    const [loading, setLoading] = useState(false);
    const [activePage, setActivePage] = usePageFromHash(pageFromHash);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: dashboardCallbackUrl(activePage),
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
            {activePage === "quests" && <QuestOverview />}
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
            data-theme="accent"
            onClick={onSignIn}
            disabled={loading}
            className="w-full justify-center gap-2 text-center"
        >
            <GitHubIcon className="h-4 w-4 shrink-0" />
            {loading ? "Signing in..." : "Sign in with GitHub"}
        </Button>
    );
}
