import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { DashboardSignInBanner } from "../components/auth/dashboard-sign-in-banner.tsx";
import { DashboardSignInTrigger } from "../components/auth/dashboard-sign-in-trigger.tsx";
import { DashboardShell } from "../components/layout/dashboard-shell.tsx";
import {
    isDashboardPath,
    SIGNED_OUT_NAV_ITEMS,
} from "../components/layout/dashboard-theme.ts";
import { NewsFaq } from "../components/news-faq";

type SignInSearch = {
    next?: string;
};

function parseNext(value: unknown): string | undefined {
    if (
        typeof value !== "string" ||
        !value.startsWith("/") ||
        value.startsWith("//")
    ) {
        return undefined;
    }

    const url = new URL(value, "https://enter.pollinations.ai");
    if (!isDashboardPath(url.pathname)) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
}

export const Route = createFileRoute("/sign-in")({
    validateSearch: (search: Record<string, unknown>): SignInSearch => ({
        next: parseNext(search.next),
    }),
    beforeLoad: async ({ search }) => {
        const result = await authClient.getSession();
        if (!result.data?.user) return;

        const pendingRedirectUrl = localStorage.getItem("pending_redirect_url");
        if (pendingRedirectUrl) {
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

        if (search.next) throw redirect({ href: search.next });
        throw redirect({ to: "/pollen" });
    },
    component: SignInPage,
});

function SignInPage() {
    return (
        <DashboardShell
            navItems={SIGNED_OUT_NAV_ITEMS}
            accountArea={<DashboardSignInTrigger defaultOpen />}
        >
            <DashboardSignInBanner />
            <NewsFaq />
        </DashboardShell>
    );
}
