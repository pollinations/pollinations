import { Heading, Text } from "@pollinations/ui";
import { AuthModal, AuthModalHeader } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { oauthSignInCallback } from "../lib/oauth-sign-in.ts";
import { SignedOutAccountArea } from "./_dashboard.tsx";

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
        <AuthModal dialog={{ labelledBy: "app-title" }}>
            <AuthModalHeader />
            <div className="flex flex-col gap-5 px-6 pb-6 pt-4">
                <div className="flex flex-col gap-2">
                    <Heading id="app-title">{name}</Heading>
                    <Text tone="soft">
                        Sign in with your Pollinations admin account.
                    </Text>
                </div>
                <SignedOutAccountArea
                    callbackURL={
                        typeof window === "undefined"
                            ? undefined
                            : oauthSignInCallback(window.location.href)
                    }
                />
            </div>
        </AuthModal>
    );
}
