import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { FAQ } from "../components/faq.tsx";
import { Button } from "../components/button.tsx";
import { Header } from "../components/header.tsx";
import { NewsBanner } from "../components/news-banner.tsx";
import { Pricing } from "../components/pricing/index.ts";
import { z } from "zod";
import { REDIRECT_URL_STORAGE_KEY } from "../constants.ts";

const searchSchema = z.object({
    redirect_url: z.string().optional(),
});

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    validateSearch: searchSchema,
    beforeLoad: ({ context }) => {
        // redirect if already signed in
        if (context.user) throw redirect({ to: "/" });
    },
});

function RouteComponent() {
    const { auth } = Route.useRouteContext();
    const search = Route.useSearch();
    const [loading, setLoading] = useState(false);

    // Store redirect_url in localStorage when present
    useEffect(() => {
        if (search.redirect_url) {
            localStorage.setItem(REDIRECT_URL_STORAGE_KEY, search.redirect_url);
        }
    }, [search.redirect_url]);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await auth.signIn.social({
            provider: "github",
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <NewsBanner />
            <div className="flex flex-col gap-20">
                <Header>
                    <div className="relative">
                        <Button
                            as="button"
                            onClick={handleSignIn}
                            disabled={loading}
                            className="bg-amber-200 text-amber-900 hover:brightness-105"
                        >
                            {loading ? "Signing in..." : "Sign in with Github"}
                        </Button>
                        <a
                            href="https://github.com/pollinations/pollinations/issues/5543"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute -bottom-4 right-0 text-xs text-gray-500 hover:text-gray-700 underline"
                        >
                            more options?
                        </a>
                    </div>
                    <Button
                        as="a"
                        href="/api/docs"
                        className="bg-gray-900 text-white hover:!brightness-90"
                    >
                        API Reference
                    </Button>
                </Header>
                <FAQ />
                <Pricing />
            </div>
        </div>
    );
}
