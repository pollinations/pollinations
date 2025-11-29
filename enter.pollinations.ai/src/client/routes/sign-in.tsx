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
            // OAuth params passed from oidcProvider
            client_id: search.client_id as string | undefined,
            redirect_uri: search.redirect_uri as string | undefined,
            response_type: search.response_type as string | undefined,
            scope: search.scope as string | undefined,
            state: search.state as string | undefined,
        };
    },
    beforeLoad: ({ context, search }) => {
        // If this is an OAuth flow and user is already signed in,
        // redirect back to authorize endpoint (cookie has the params)
        if (context.user && search.client_id) {
            const params = new URLSearchParams();
            if (search.client_id) params.set("client_id", search.client_id);
            if (search.redirect_uri)
                params.set("redirect_uri", search.redirect_uri);
            if (search.response_type)
                params.set("response_type", search.response_type);
            if (search.scope) params.set("scope", search.scope);
            if (search.state) params.set("state", search.state);
            // Use window.location for API route redirect (not a client route)
            window.location.href = `/api/auth/oauth2/authorize?${params.toString()}`;
            // Throw to prevent further rendering while redirecting
            throw new Error("Redirecting to OAuth authorize");
        }
        // Regular sign-in redirect
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
                <Button
                    as="a"
                    href="/api/docs"
                    className="bg-gray-900 text-white hover:!brightness-90"
                >
                    API Reference
                </Button>
            </Header>
            <FAQ />
        </div>
    );
}
