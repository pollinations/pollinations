import { AuthInfoCard, GitHubSignInButton } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
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
    const [name, setName] = useState("This dashboard");
    const { signIn, isSigningIn, error } = useGitHubSignIn(
        typeof window === "undefined"
            ? undefined
            : oauthSignInCallback(window.location.href),
    );
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
            appFirst
            app={
                <AppAttribution
                    titleId="sign-in-title"
                    attribution={{ appName: name }}
                    isDeviceMode={false}
                    redirectHostname=""
                />
            }
            error={error}
            actions={
                <GitHubSignInButton
                    onClick={() => void signIn()}
                    isSigningIn={isSigningIn}
                    retry={Boolean(error)}
                />
            }
        >
            <AuthInfoCard title={null}>
                Shares your name, email, picture and admin status.
            </AuthInfoCard>
        </SignInScreen>
    );
}
