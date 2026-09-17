import { ArrowRightIcon, Button, RefreshIcon } from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { oauthSignInCallback } from "../lib/oauth-sign-in.ts";
import { parseAppUrl, ReturnToApp } from "../lib/return-to-app.tsx";

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
    // The issuer signs the whole query. "invalid" means the server knows no
    // such client (hand-typed or expired link); "unreachable" means the
    // check itself failed and can be retried.
    const [client, setClient] = useState<
        { name: string } | "loading" | "invalid" | "unreachable"
    >("loading");
    const [lookupAttempt, setLookupAttempt] = useState(0);
    // biome-ignore lint/correctness/useExhaustiveDependencies: lookupAttempt re-runs the check when the user selects Try again.
    useEffect(() => {
        let cancelled = false;
        setClient("loading");
        void authClient.oauth2
            .publicClientPrelogin({ client_id })
            .then(({ data }) => {
                if (cancelled) return;
                setClient(
                    data?.client_name ? { name: data.client_name } : "invalid",
                );
            })
            .catch(() => {
                if (!cancelled) setClient("unreachable");
            });
        return () => {
            cancelled = true;
        };
    }, [client_id, lookupAttempt]);

    const parsedRedirect = parseAppUrl(redirect_uri);
    const redirectHost = parsedRedirect ? new URL(parsedRedirect).host : "";

    if (client === "loading") return <AuthModalLoading title="Sign in" />;

    if (client === "unreachable") {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Sign in"
                error="Couldn’t check this sign-in link."
                actions={
                    <Button
                        intent="neutral"
                        icon={<RefreshIcon />}
                        onClick={() =>
                            setLookupAttempt((attempt) => attempt + 1)
                        }
                    >
                        Try again
                    </Button>
                }
            />
        );
    }

    // The dashboard that sent the link issues a fresh one; a link with no
    // callback address falls back to this dashboard. Always a way out.
    if (client === "invalid") {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Sign in"
                description="with your Pollinations account."
                error="This sign-in link is invalid or has expired. Open the dashboard again to get a new one."
                actions={
                    parsedRedirect ? (
                        <ReturnToApp
                            returnUrl={new URL(parsedRedirect).origin}
                        />
                    ) : (
                        <Button
                            as="a"
                            intent="neutral"
                            icon={<ArrowRightIcon />}
                            href="/"
                        >
                            Go to dashboard
                        </Button>
                    )
                }
            />
        );
    }

    const callbackURL =
        typeof window === "undefined"
            ? undefined
            : oauthSignInCallback(window.location.href);
    const appCard = (
        <AppAttribution
            attribution={{ appName: client.name }}
            redirectHostname={redirectHost}
        />
    );

    // A signed-in admin only needs to resume the dashboard's authorize request.
    if (user) {
        return (
            <AuthFlowScreen
                title="Sign in"
                subject={appCard}
                description={`as ${user.name || user.githubUsername || user.email}.`}
                actions={
                    <Button
                        as="a"
                        href={callbackURL}
                        intent="neutral"
                        icon={<ArrowRightIcon />}
                    >
                        Continue
                    </Button>
                }
            />
        );
    }

    return (
        <SignInScreen
            title="Sign in"
            subject={appCard}
            description="with your Pollinations admin account."
            callbackURL={callbackURL}
        />
    );
}
