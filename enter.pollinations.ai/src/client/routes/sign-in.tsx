import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FAQ } from "../components/faq.tsx";
import { Button } from "../components/button.tsx";
import { Header } from "../components/header.tsx";
import { NewsBanner } from "../components/news-banner.tsx";
import { Pricing } from "../components/pricing/index.ts";
import { authClient } from "../auth.ts";

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.data?.user) {
            //already signed in
            throw redirect({ to: "/" });
        }
    },
});

function RouteComponent() {
    const [loading, setLoading] = useState(false);

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
                            className="bg-amber-200 text-amber-900 hover:brightness-105 whitespace-nowrap"
                        >
                            {loading ? "Signing in..." : "Sign in with Github"}
                        </Button>
                        <a
                            href="https://github.com/pollinations/pollinations/issues/5543"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute left-1/2 -translate-x-1/2 -bottom-5 text-xs text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
                        >
                            more options?
                        </a>
                    </div>
                    <Button
                        as="a"
                        href="/api/docs"
                        className="bg-gray-900 text-white hover:brightness-90! whitespace-nowrap"
                    >
                        API Ref.
                    </Button>
                </Header>
                <FAQ />
                <Pricing />
            </div>
        </div>
    );
}
