import { ArrowRightIcon, Button, Text } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
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
    const { data: session } = authClient.useSession();
    const user = session?.user;
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

    const callbackURL =
        typeof window === "undefined"
            ? undefined
            : oauthSignInCallback(window.location.href);
    const appCard = (
        <AppAttribution
            attribution={{ appName: name }}
            isDeviceMode={false}
            redirectHostname=""
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
