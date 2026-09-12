import { Button } from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { ApiKey } from "../components/keys";
import { EditApiKeyDialog } from "../components/keys/edit-api-key-dialog.tsx";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import {
    parseAppUrl,
    ReturnToApp,
    resolveReturnUrl,
} from "../lib/return-to-app.tsx";
import { updateApiKey } from "../lib/update-api-key.ts";

type EditKeySearch = {
    id: string;
    redirect?: string;
};

/**
 * Standalone key editor for one key, shown on the auth-flow background.
 * Linked from the key-budget notice gen returns inside chats, so the user
 * can raise the budget and go back to the app.
 */
export const Route = createFileRoute("/edit-key")({
    validateSearch: (search: Record<string, unknown>): EditKeySearch => ({
        id: typeof search.id === "string" ? search.id : "",
        redirect: parseAppUrl(search.redirect) ?? undefined,
    }),
    component: EditKeyPage,
});

type Outcome = "editing" | "saved" | "closed";

function EditKeyPage() {
    const { id, redirect } = Route.useSearch();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const [apiKey, setApiKey] = useState<ApiKey | null | undefined>(undefined);
    const [outcome, setOutcome] = useState<Outcome>("editing");
    const returnUrl = resolveReturnUrl(redirect ?? null);

    useEffect(() => {
        if (!user || !id) return;
        apiClient["api-keys"]
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((result) => {
                const keys = (result?.data ?? []) as ApiKey[];
                setApiKey(keys.find((key) => key.id === id) ?? null);
            })
            .catch(() => setApiKey(null));
    }, [user, id]);

    if (isPending) return <AuthModalLoading />;

    if (!user) {
        return (
            <AuthModal
                dialog={{ label: "Sign in to edit this key" }}
                tone={signInError ? "error" : undefined}
            >
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    {signInError ? (
                        <ErrorBanner>{signInError}</ErrorBanner>
                    ) : (
                        <AuthInfoCard title="Edit API key">
                            <p className="text-sm text-theme-text-base">
                                Sign in to change this key's budget and limits.
                            </p>
                        </AuthInfoCard>
                    )}
                    <div className="flex justify-end">
                        <Button
                            as="button"
                            onClick={signIn}
                            disabled={isSigningIn}
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Continue with GitHub"}
                        </Button>
                    </div>
                </div>
            </AuthModal>
        );
    }

    if (outcome !== "editing") {
        return (
            <AuthModal dialog={{ label: "Key updated" }}>
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    <AuthInfoCard
                        title={
                            outcome === "saved" ? "Key updated" : "No changes"
                        }
                    >
                        <p className="text-sm text-theme-text-base">
                            {outcome === "saved"
                                ? "The new limits apply to the next request."
                                : "The key was left as it is."}
                        </p>
                    </AuthInfoCard>
                    <ReturnToApp returnUrl={returnUrl} />
                </div>
            </AuthModal>
        );
    }

    if (!id || apiKey === null) {
        return (
            <AuthModal dialog={{ label: "Key not found" }} tone="error">
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    <ErrorBanner>
                        This key doesn't exist or belongs to another account.
                    </ErrorBanner>
                    <ReturnToApp returnUrl={returnUrl} />
                </div>
            </AuthModal>
        );
    }

    if (apiKey === undefined) return <AuthModalLoading />;

    return (
        <EditApiKeyDialog
            apiKey={apiKey}
            onUpdate={async (keyId, updates) => {
                await updateApiKey(keyId, updates);
                setOutcome("saved");
            }}
            onClose={() =>
                setOutcome((current) =>
                    current === "editing" ? "closed" : current,
                )
            }
        />
    );
}
