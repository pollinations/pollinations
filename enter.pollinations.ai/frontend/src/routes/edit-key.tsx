import {
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AuthAccountIdentity } from "../components/auth/auth-account-identity.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import type { ApiKey } from "../components/keys";
import { EditApiKeyDialog } from "../components/keys/edit-api-key-dialog.tsx";
import { useAccountBalance } from "../hooks/use-account-balance.ts";
import {
    parseAppUrl,
    preferredReturnUrl,
    ReturnToApp,
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
    const navigate = useNavigate({ from: "/edit-key" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const [apiKey, setApiKey] = useState<ApiKey | null | undefined>(undefined);
    const balance = useAccountBalance(Boolean(user));
    const [outcome, setOutcome] = useState<Outcome>("editing");
    const returnUrl = redirect ?? null;
    const topUpHref =
        typeof window === "undefined"
            ? "/top-up"
            : `/top-up?${new URLSearchParams({ redirect: window.location.href })}`;

    useEffect(() => {
        const from = preferredReturnUrl(redirect);
        if (from) {
            void navigate({
                search: (prev) => ({ ...prev, redirect: from }),
                replace: true,
            });
        }
    }, [navigate, redirect]);

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

    if (isPending) return <AuthModalLoading title="Update access" />;

    if (!user) {
        return (
            <SignInScreen
                title="Update access"
                description="Sign in to change this key’s budget, expiry and models."
            />
        );
    }

    const accountIdentity = (
        <AuthAccountIdentity
            user={user}
            balance={balance}
            topUpHref={topUpHref}
        />
    );

    if (outcome !== "editing") {
        return (
            <AuthFlowScreen
                footnote="back"
                title={
                    outcome === "saved" ? "Access updated" : "Nothing changed"
                }
                description={
                    outcome === "saved"
                        ? "The new permissions apply to future requests. You can return to the app or close this tab."
                        : "Your key’s permissions are as they were. You can return to the app or close this tab."
                }
                balance={balance}
                topUpHref={topUpHref}
                actions={
                    returnUrl ? (
                        <ReturnToApp returnUrl={returnUrl} />
                    ) : undefined
                }
            />
        );
    }

    if (!id || apiKey === null) {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Key unavailable"
                balance={balance}
                topUpHref={topUpHref}
                actions={
                    returnUrl ? (
                        <ReturnToApp returnUrl={returnUrl} />
                    ) : undefined
                }
            >
                <ErrorBanner>
                    Check that you’re signed in to the account that owns it.
                </ErrorBanner>
            </AuthFlowScreen>
        );
    }

    if (apiKey === undefined) return <AuthModalLoading title="Update access" />;

    return (
        <EditApiKeyDialog
            key={apiKey.id}
            apiKey={apiKey}
            header={<AuthModalHeader>{accountIdentity}</AuthModalHeader>}
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
