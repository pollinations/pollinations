import { Surface, Text } from "@pollinations/ui";
import { AuthModalHeader, AuthModalLoading } from "@pollinations/ui/auth";
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

    // The card reads as one sentence: "Edit key permissions · {key} · {step}"
    const subject = (
        <Surface>
            <Text size="sm" weight="semibold" tone="strong">
                {apiKey?.name ?? id}
            </Text>
            {apiKey?.start && (
                <Text size="xs" className="mt-1 font-mono">
                    {apiKey.start}…
                </Text>
            )}
        </Surface>
    );

    if (isPending)
        return (
            <AuthModalLoading title="Edit key permissions" subject={subject} />
        );

    if (!user) {
        return (
            <SignInScreen
                title="Edit key permissions"
                subject={subject}
                description="Sign in to change them."
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
                title="Edit key permissions"
                subject={subject}
                description={
                    outcome === "saved"
                        ? "Saved, they apply to future requests."
                        : "Nothing changed."
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
                title="Edit key permissions"
                subject={subject}
                error="Couldn’t load this key. Check that you’re signed in to the account that owns it."
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

    if (apiKey === undefined)
        return (
            <AuthModalLoading title="Edit key permissions" subject={subject} />
        );

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
