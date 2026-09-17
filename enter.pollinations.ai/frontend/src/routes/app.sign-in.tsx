import { ArrowRightIcon, Button, Text } from "@pollinations/ui";
import { AuthModalLoading, ErrorBanner } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { oauthSignInCallback } from "../lib/oauth-sign-in.ts";
import { parseAppUrl } from "../lib/return-to-app.tsx";

export const Route = createFileRoute("/app/sign-in")({
    validateSearch: (search: Record<string, unknown>) => ({
        client_id: typeof search.client_id === "string" ? search.client_id : "",
        redirect_uri:
            typeof search.redirect_uri === "string" ? search.redirect_uri : "",
    }),
    head: () => ({ meta: [{ title: "Sign in | pollinations.ai" }] }),
    component: AppSignIn,
});

function AppSignIn() {
    const { client_id, redirect_uri } = Route.useSearch();
    const { data: session } = authClient.useSession();
    const user = session?.user;
    // The issuer signs the whole query; the lookup fails for hand-typed or
    // expired links, and then there is no dashboard to sign in to.
    const [client, setClient] = useState<
        { name: string } | "loading" | "invalid"
    >("loading");
    useEffect(() => {
        let cancelled = false;
        void authClient.oauth2
            .publicClientPrelogin({ client_id })
            .then(({ data }) => {
                if (cancelled) return;
                setClient(
                    data?.client_name ? { name: data.client_name } : "invalid",
                );
            })
            .catch(() => {
                if (!cancelled) setClient("invalid");
            });
        return () => {
            cancelled = true;
        };
    }, [client_id]);

    if (client === "loading")
        return <AuthModalLoading title="Checking your sign-in" />;

    if (client === "invalid") {
        return (
            <AuthFlowScreen title="Couldn’t sign in">
                <ErrorBanner>
                    This sign-in link is invalid or has expired. Open the
                    dashboard again to sign in.
                </ErrorBanner>
            </AuthFlowScreen>
        );
    }

    const callbackURL =
        typeof window === "undefined"
            ? undefined
            : oauthSignInCallback(window.location.href);
    const parsedRedirect = parseAppUrl(redirect_uri);
    const redirectHost = parsedRedirect ? new URL(parsedRedirect).host : "";
    const appCard = (
        <AppAttribution
            attribution={{ appName: client.name }}
            isDeviceMode={false}
            redirectHostname={redirectHost}
        />
    );

    // A signed-in admin only needs to resume the dashboard's authorize request.
    if (user) {
        return (
            <AuthFlowScreen
                title="Sign in"
                actions={
                    <Button as="a" href={callbackURL} icon={<ArrowRightIcon />}>
                        Continue
                    </Button>
                }
            >
                {appCard}
                <Text size="sm" tone="muted">
                    You’re signed in as{" "}
                    {user.name || user.githubUsername || user.email}.
                </Text>
            </AuthFlowScreen>
        );
    }

    return (
        <SignInScreen title="Sign in" callbackURL={callbackURL}>
            {appCard}
            <Text size="sm" tone="muted">
                Sign in with your pollinations.ai admin account.
            </Text>
        </SignInScreen>
    );
}
