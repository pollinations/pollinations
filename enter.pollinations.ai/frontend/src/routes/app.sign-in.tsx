import { Heading, ScrollArea } from "@pollinations/ui";
import {
    AuthAccessItem,
    AuthAccessSummary,
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
} from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
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
        <AuthModal
            dialog={{ labelledBy: "app-title" }}
            contentClassName="flex flex-col"
        >
            <AuthModalHeader logoOnly />
            <ScrollArea className="min-h-0 px-6 py-2 space-y-4 overscroll-contain">
                <div>
                    <Heading
                        as="h1"
                        size="section"
                        id="app-title"
                        className="py-3"
                    >
                        Sign in to pollinations.ai
                    </Heading>
                    <p className="mb-3 font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                        To access:
                    </p>
                    <AuthInfoCard title={null}>
                        <AppAttribution
                            attribution={{ appName: name }}
                            isDeviceMode={false}
                            redirectHostname=""
                        />
                    </AuthInfoCard>
                    <AuthAccessSummary title="Required for sign-in">
                        <AuthAccessItem checked>
                            Name, email and picture.
                        </AuthAccessItem>
                        <AuthAccessItem checked>Admin access.</AuthAccessItem>
                    </AuthAccessSummary>
                </div>
            </ScrollArea>
            <div className="shrink-0 px-6 py-4">
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
