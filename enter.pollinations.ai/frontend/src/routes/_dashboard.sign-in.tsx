import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../auth.ts";
import { DashboardSignInDialog } from "../components/auth/dashboard-sign-in-banner.tsx";
import { isDashboardPath } from "../components/layout/dashboard-theme.ts";
import { NewsFaq } from "../components/news-faq";

type SignInSearch = {
    next?: string;
    // A link that names a provider, such as the Classic API's free limit
    // page, goes straight on to it instead of waiting for a click
    provider?: "github";
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

export const Route = createFileRoute("/_dashboard/sign-in")({
    validateSearch: (search: Record<string, unknown>): SignInSearch => ({
        next: parseNext(search.next),
        provider: search.provider === "github" ? "github" : undefined,
    }),
    beforeLoad: ({ context, search }) => {
        if (!context.user) return;

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
    const [open, setOpen] = useState(true);
    const { provider } = Route.useSearch();
    const navigate = useNavigate({ from: "/sign-in" });
    const started = useRef(false);
    useEffect(() => {
        if (!provider || started.current) return;
        started.current = true;
        // The provider leaves this history entry first, so coming back from
        // GitHub shows the dialog instead of leaving again
        void navigate({
            search: (search) => ({ ...search, provider: undefined }),
            replace: true,
        }).then(() =>
            authClient.signIn.social({
                provider,
                callbackURL: window.location.href,
            }),
        );
    }, [provider, navigate]);
    return (
        <>
            {open && <DashboardSignInDialog onCancel={() => setOpen(false)} />}
            <NewsFaq />
        </>
    );
}
