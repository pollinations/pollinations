import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { ErrorBanner } from "../components/auth/auth-modal.tsx";
import { SocialSignInButtons } from "../components/auth/social-sign-in-buttons.tsx";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import {
    DASHBOARD_NAV_ITEMS,
    isDashboardPage,
} from "../components/layout/dashboard-theme.ts";
import { UpdatesPage } from "../components/layout/updates-page.tsx";
import { Pricing } from "../components/pricing";
import { useSocialSignIn } from "../hooks/use-social-sign-in.ts";
import type { SocialProvider } from "../lib/social-providers.ts";

const SIGNED_OUT_PAGES: ReadonlySet<DashboardPage> = new Set([
    "updates",
    "models",
]);

const SIGNED_OUT_NAV_ITEMS = DASHBOARD_NAV_ITEMS.filter((item) =>
    SIGNED_OUT_PAGES.has(item.id),
);

function pageFromHash(hash: string): DashboardPage {
    const page = hash.replace(/^#/, "");
    if (isDashboardPage(page) && SIGNED_OUT_PAGES.has(page)) return page;
    if (page === "news" || page === "faq") return "updates";
    if (page === "pricing") return "models";
    return "updates";
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
    const { pendingProvider, error, signIn } = useSocialSignIn();
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
                    error={error}
                    pendingProvider={pendingProvider}
                    onSignIn={signIn}
                />
            }
        >
            {activePage === "updates" && <UpdatesPage />}
            {activePage === "models" && <Pricing />}
        </DashboardShell>
    );
}

function SignedOutAccountArea({
    error,
    pendingProvider,
    onSignIn,
}: {
    error: string | null;
    pendingProvider: SocialProvider | null;
    onSignIn: (provider: SocialProvider) => void;
}) {
    return (
        <div className="flex flex-col gap-2.5">
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <SocialSignInButtons
                pendingProvider={pendingProvider}
                mode="github-first"
                onSignIn={onSignIn}
            />
        </div>
    );
}
