import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { SocialSignInButtons } from "../components/auth/social-sign-in-buttons.tsx";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import {
    DASHBOARD_NAV_ITEMS,
    isDashboardPage,
} from "../components/layout/dashboard-theme.ts";
import { usePageFromHash } from "../components/layout/use-page-from-hash.ts";
import { Models } from "../components/models";
import { NewsFaq } from "../components/news-faq";
import { useSocialProviders } from "../hooks/use-social-providers.ts";
import { useSocialSignIn } from "../hooks/use-social-sign-in.ts";
import type { SocialProvider } from "../lib/social-providers.ts";

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
    const { pendingProvider, error: signInError, signIn } = useSocialSignIn();
    const socialProviders = useSocialProviders();
    const [activePage, setActivePage] = usePageFromHash(pageFromHash);

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
                    socialProviders={socialProviders}
                    pendingProvider={pendingProvider}
                    signInError={signInError}
                    onSignIn={signIn}
                />
            }
        >
            {activePage === "news-faq" && <NewsFaq />}
            {activePage === "models" && <Models />}
        </DashboardShell>
    );
}

function SignedOutAccountArea({
    socialProviders,
    pendingProvider,
    signInError,
    onSignIn,
}: {
    socialProviders: ReturnType<typeof useSocialProviders>;
    pendingProvider: SocialProvider | null;
    signInError: string | null;
    onSignIn: (provider: SocialProvider) => void;
}) {
    return (
        <SocialSignInButtons
            providers={socialProviders.providers}
            isLoading={socialProviders.isLoading}
            error={signInError ?? socialProviders.error}
            pendingProvider={pendingProvider}
            onSignIn={onSignIn}
            className="w-full"
        />
    );
}
