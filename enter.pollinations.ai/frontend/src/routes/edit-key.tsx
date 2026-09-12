import { Button, Heading } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthModalLoading,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AuthAccountIdentity } from "../components/auth/auth-account-identity.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { EditApiKeyDialog } from "../components/keys/edit-api-key-dialog.tsx";
import type { ApiKey } from "../components/keys/types.ts";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import {
    AccountReturn,
    parseAccountReturn,
} from "../lib/account-action-return.tsx";
import { updateApiKey } from "../lib/update-api-key.ts";

export const Route = createFileRoute("/edit-key")({
    validateSearch: (search: Record<string, unknown>) => ({
        id: typeof search.id === "string" ? search.id : "",
        redirect: parseAccountReturn(search.redirect),
    }),
    component: EditKeyPage,
});

function EditKeyPage() {
    const { id, redirect } = Route.useSearch();
    const { data: session, isPending } = authClient.useSession();
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{
        key?: ApiKey;
        error?: string;
        missing?: boolean;
    } | null>(null);
    const [finished, setFinished] = useState<"saved" | "closed" | null>(null);
    const userId = session?.user.id;
    const [balances, setBalances] = useState<{
        paid: number;
        quest: number;
    } | null>(null);
    useEffect(() => {
        setBalances(null);
        if (!userId) return;
        let active = true;
        apiClient.customer.balance
            .$get()
            .then(async (response) => {
                if (!response.ok) return;
                const balance = await response.json();
                if (active)
                    setBalances({
                        paid: balance.packBalance,
                        quest: balance.tierBalance,
                    });
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [userId]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the failed request.
    useEffect(() => {
        if (!userId || !id) return;
        let active = true;
        setResult(null);
        apiClient["api-keys"]
            .$get()
            .then(async (response) => {
                if (!response.ok)
                    throw new Error("Couldn’t load app access. Try again.");
                const data = await response.json();
                const key = (data.data as ApiKey[]).find(
                    (key) => key.id === id,
                );
                if (active) setResult(key ? { key } : { missing: true });
            })
            .catch(() => {
                if (active)
                    setResult({
                        error: "Couldn’t load app access. Try again.",
                    });
            });
        return () => {
            active = false;
        };
    }, [userId, id, attempt]);
    const back = redirect ? <AccountReturn href={redirect} /> : undefined;
    const account = session?.user ? (
        <AuthAccountIdentity user={session.user} balances={balances} />
    ) : undefined;
    if (isPending) return <AuthModalLoading title="Loading app access" />;
    if (!userId)
        return (
            <SignInScreen
                title="Sign in to manage app access"
                error={signInError}
                actions={
                    <GitHubSignInButton
                        onClick={signIn}
                        isSigningIn={isSigningIn}
                        retry={!!signInError}
                    />
                }
                secondaryAction={back}
            />
        );
    if (finished || !id || result?.missing || result?.error)
        return (
            <AuthFlowLayout
                account={account}
                actions={
                    result?.error ? (
                        <Button onClick={() => setAttempt((n) => n + 1)}>
                            Try again
                        </Button>
                    ) : null
                }
                secondaryAction={back}
            >
                <Heading as="h1" size="section">
                    {finished === "saved"
                        ? "App access updated"
                        : finished === "closed"
                          ? "No changes"
                          : "App access unavailable"}
                </Heading>
                {finished ? (
                    <p>
                        {finished === "saved"
                            ? "The new limits apply to your next request."
                            : "Your existing access is unchanged."}{" "}
                        You can close this tab.
                    </p>
                ) : (
                    <ErrorBanner>
                        {result?.error ??
                            "This key doesn’t exist or belongs to another account."}
                    </ErrorBanner>
                )}
            </AuthFlowLayout>
        );
    if (!result?.key) return <AuthModalLoading title="Loading app access" />;
    return (
        <EditApiKeyDialog
            title="App access"
            presentation="page"
            account={account}
            key={result.key.id}
            apiKey={result.key}
            secondaryAction={
                <Button
                    as="a"
                    href="/top-up"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-theme="neutral"
                >
                    Wallet
                </Button>
            }
            onUpdate={async (keyId, updates) => {
                await updateApiKey(keyId, updates);
                setFinished("saved");
            }}
            onClose={() => setFinished((old) => old ?? "closed")}
        />
    );
}
