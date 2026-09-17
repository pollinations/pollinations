import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { oauthSignInCallback } from "../lib/oauth-sign-in.ts";

export const Route = createFileRoute("/app/sign-in")({
    validateSearch: (search: Record<string, unknown>) => ({
        client_id: typeof search.client_id === "string" ? search.client_id : "",
    }),
    head: () => ({ meta: [{ title: "Sign in | pollinations.ai" }] }),
    component: AppSignIn,
});

function AppSignIn() {
    const { client_id } = Route.useSearch();
    const [name, setName] = useState("Pollinations");
    useEffect(() => {
        let cancelled = false;
        void authClient.oauth2
            .publicClientPrelogin({ client_id })
            .then(({ data }) => {
                if (!cancelled && data?.client_name) setName(data.client_name);
            })
            .catch(() => {
                /* The sign-in endpoint will report an invalid request. */
            });
        return () => {
            cancelled = true;
        };
    }, [client_id]);
    return (
        <SignInScreen
            title={name}
            description="Sign in with your Pollinations admin account."
            callbackURL={
                typeof window === "undefined"
                    ? undefined
                    : oauthSignInCallback(window.location.href)
            }
        />
    );
}
