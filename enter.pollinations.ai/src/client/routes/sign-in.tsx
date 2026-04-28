import { createFileRoute, redirect } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { Button } from "../components/button.tsx";
import { DashboardSection } from "../components/layout/dashboard-section.tsx";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import {
    type DashboardTheme,
    isDashboardPage,
} from "../components/layout/dashboard-theme.ts";
import { UpdatesPage } from "../components/layout/updates-page.tsx";
import { Pricing } from "../components/pricing";

function pageFromHash(hash: string): DashboardPage {
    const page = hash.replace(/^#/, "");
    if (isDashboardPage(page)) return page;
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
            onPageChange={handlePageChange}
            accountArea={
                <SignedOutAccountArea
                    loading={loading}
                    onSignIn={handleSignIn}
                />
            }
        >
            {activePage === "updates" && <UpdatesPage />}
            {activePage === "pollen" && (
                <SignedOutPanel
                    title="Pollen"
                    theme="amber"
                    loading={loading}
                    onSignIn={handleSignIn}
                >
                    Sign in to view your balance, top up pollen, and manage your
                    tier.
                </SignedOutPanel>
            )}
            {activePage === "usage" && (
                <SignedOutPanel
                    title="Usage"
                    theme="pink"
                    loading={loading}
                    onSignIn={handleSignIn}
                >
                    Sign in to view request volume, pollen spend, and usage
                    filters.
                </SignedOutPanel>
            )}
            {activePage === "keys" && (
                <SignedOutPanel
                    title="Keys"
                    theme="blue"
                    loading={loading}
                    onSignIn={handleSignIn}
                >
                    Sign in to create API keys and app keys for your projects.
                </SignedOutPanel>
            )}
            {activePage === "models" && <Pricing />}
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
        <div className="flex flex-col gap-2">
            <Button
                as="button"
                onClick={onSignIn}
                disabled={loading}
                color="amber"
                weight="light"
                className="w-full justify-center text-center"
            >
                {loading ? "Signing in..." : "Sign in with GitHub"}
            </Button>
            <a
                href="https://github.com/pollinations/pollinations/issues/5543"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
            >
                more options?
            </a>
        </div>
    );
}

function SignedOutPanel({
    title,
    theme,
    loading,
    onSignIn,
    children,
}: {
    title: string;
    theme: Extract<DashboardTheme, "amber" | "blue" | "pink">;
    loading: boolean;
    onSignIn: () => void;
    children: ReactNode;
}) {
    return (
        <DashboardSection title={title} theme={theme} framed>
            <div className="flex flex-col items-start gap-4 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <p>{children}</p>
                <Button
                    as="button"
                    color={theme}
                    weight="light"
                    onClick={onSignIn}
                    disabled={loading}
                    className="shrink-0"
                >
                    {loading ? "Signing in..." : "Sign in"}
                </Button>
            </div>
        </DashboardSection>
    );
}
