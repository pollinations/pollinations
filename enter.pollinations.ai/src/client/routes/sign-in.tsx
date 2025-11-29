import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FAQ } from "../components/faq.tsx";
import { Button } from "../components/button.tsx";
import { Header } from "../components/header.tsx";

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            redirect: search.redirect as string | undefined,
        };
    },
    beforeLoad: ({ context, search }) => {
        // redirect if already signed in
        if (context.user) throw redirect({ to: search.redirect || "/" });
    },
});

function RouteComponent() {
    const { auth } = Route.useRouteContext();
    const { redirect: redirectUrl } = Route.useSearch();
    const [loading, setLoading] = useState(false);

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await auth.signIn.social({
            provider: "github",
            callbackURL: redirectUrl || "/",
        });
        if (error) {
            setLoading(false);
            throw error;
        }
    };

    return (
        <div className="flex flex-col gap-20">
            <Header>
                <Button
                    as="button"
                    onClick={handleSignIn}
                    disabled={loading}
                    className="bg-amber-200 text-amber-900 hover:brightness-105"
                >
                    {loading ? "Signing in..." : "Sign in with Github"}
                </Button>
                <Button as="a" href="/api/docs" className="bg-gray-900 text-white hover:!brightness-90">
                    API Reference
                </Button>
            </Header>
            <FAQ />
        </div>
    );
}
