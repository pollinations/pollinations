import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import {
    type SocialProvider,
    SocialSignInButtons,
} from "@pollinations/ui/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
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
            <MobileBrandHeader />
            <MobileSignInPrompt
                socialProviders={socialProviders}
                pendingProvider={pendingProvider}
                signInError={signInError}
                onSignIn={signIn}
            />
            {activePage === "news-faq" && <NewsFaq />}
            {activePage === "models" && <Models />}
        </DashboardShell>
    );
}

/**
 * The wordmark lives in the rail/drawer, both hidden on mobile. Give the
 * logged-out mobile view its own brand header at the top of the content.
 */
function MobileBrandHeader() {
    return (
        <div className="flex justify-center pt-1 md:hidden">
            <a
                href="https://pollinations.ai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pollinations"
                className="text-theme-text-strong"
            >
                <span className="sr-only">Pollinations</span>
                <span
                    aria-hidden="true"
                    className="block h-7 w-[210px] bg-current"
                    style={{
                        WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
                        mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
                    }}
                />
            </a>
        </div>
    );
}

/**
 * The rail (and its sign-in buttons) is desktop-only; on mobile it sits behind
 * the drawer. `/sign-in` exists to sign in, so surface the same buttons at the
 * top of the main column on small screens where the rail isn't visible.
 */
function MobileSignInPrompt({
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
        <section className="rounded-2xl bg-theme-bg-pale p-5 md:hidden">
            <h2 className="text-lg font-semibold text-theme-text-strong">
                Sign in
            </h2>
            <p className="mt-1 mb-4 text-sm text-theme-text-base">
                Continue to your Pollinations account.
            </p>
            <SocialSignInButtons
                providers={socialProviders.providers}
                isLoading={socialProviders.isLoading}
                error={signInError ?? socialProviders.error}
                pendingProvider={pendingProvider}
                onSignIn={onSignIn}
                className="w-full"
            />
        </section>
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
