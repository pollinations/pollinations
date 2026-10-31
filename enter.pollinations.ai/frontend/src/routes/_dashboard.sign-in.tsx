import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardSignInDialog } from "../components/auth/dashboard-sign-in-banner.tsx";
import { isDashboardPath } from "../components/layout/dashboard-theme.ts";
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

export const Route = createFileRoute("/_dashboard/sign-in")({
    validateSearch: (search: Record<string, unknown>): SignInSearch => ({
        next: parseNext(search.next),
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
    return (
        <>
            {open && <DashboardSignInDialog onCancel={() => setOpen(false)} />}
            <NewsFaq />
        </>
    );
}
