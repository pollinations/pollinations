import {
    Button,
    InlineLink,
    KeyChip,
    KeyIcon,
    Surface,
    Text,
    XIcon,
} from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { readError } from "../components/community-endpoints/types.ts";
import type { ApiKey } from "../components/keys/types.ts";
import {
    parseAppUrl,
    preferredReturnUrl,
    ReturnToApp,
} from "../lib/return-to-app.tsx";

type GrantModelSearch = {
    id: string;
    model: string;
    redirect?: string;
};

export const Route = createFileRoute("/grant-model")({
    head: () => ({ meta: [{ title: "Allow model access | pollinations.ai" }] }),
    validateSearch: (search: Record<string, unknown>): GrantModelSearch => ({
        id: typeof search.id === "string" ? search.id : "",
        model: typeof search.model === "string" ? search.model : "",
        redirect: parseAppUrl(search.redirect) ?? undefined,
    }),
    component: GrantModelPage,
});

function GrantModelPage() {
    const { id, model, redirect } = Route.useSearch();
    const navigate = useNavigate({ from: "/grant-model" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const userId = user?.id;
    const [key, setKey] = useState<ApiKey | null | undefined>();
    const [outcome, setOutcome] = useState<"pending" | "granted" | "declined">(
        "pending",
    );
    const [isGranting, setIsGranting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const from = preferredReturnUrl(redirect);
        if (from) {
            void navigate({
                search: (previous) => ({ ...previous, redirect: from }),
                replace: true,
            });
        }
    }, [navigate, redirect]);

    useEffect(() => {
        if (!userId || !id || !model) return;
        let canceled = false;
        setKey(undefined);
        setOutcome("pending");
        setError(null);
        apiClient["api-keys"]
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((result) => {
                if (canceled) return;
                const keys = (result?.data ?? []) as ApiKey[];
                setKey(keys.find((item) => item.id === id) ?? null);
            })
            .catch(() => {
                if (!canceled) setKey(null);
            });
        return () => {
            canceled = true;
        };
    }, [userId, id, model]);

    const subject = key ? (
        <Surface>
            <Text size="sm">Key to update</Text>
            <Text size="sm" weight="semibold" tone="strong">
                {key.name ?? key.id}
            </Text>
            {key.start && <KeyChip prefix={key.start} />}
        </Surface>
    ) : undefined;

    if (isPending) return <AuthModalLoading title="Allow model access" />;
    if (!user) {
        return (
            <SignInScreen
                title="Allow model access"
                description="Sign in as the key owner to review this request."
            />
        );
    }
    if (!id || !model || key === null) {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Allow model access"
                error="Couldn’t load this request. Check that you’re signed in as the key owner."
            />
        );
    }
    if (key === undefined) {
        return <AuthModalLoading title="Allow model access" />;
    }

    const alreadyAllowed =
        !Array.isArray(key.permissions?.models) ||
        key.permissions.models.includes(model);

    if (outcome !== "pending" || alreadyAllowed) {
        return (
            <AuthFlowScreen
                footnote="back"
                title={
                    outcome === "declined"
                        ? "Access declined"
                        : alreadyAllowed && outcome === "pending"
                          ? "Access already allowed"
                          : "Access granted"
                }
                subject={subject}
                description={
                    outcome !== "declined"
                        ? `This key can use ${model}. Retry your request in the app or conversation.`
                        : "The key’s permissions have not changed."
                }
                actions={
                    redirect ? <ReturnToApp returnUrl={redirect} /> : undefined
                }
            />
        );
    }

    return (
        <AuthFlowScreen
            title="Allow model access?"
            subject={subject}
            description="This adds one model to this key. Its spending limit, expiry, and other permissions stay the same. You can remove access later from your Keys page."
            error={error ?? undefined}
            actions={
                <>
                    <Button
                        intent="neutral"
                        icon={<XIcon />}
                        disabled={isGranting}
                        onClick={() => setOutcome("declined")}
                    >
                        Not now
                    </Button>
                    <Button
                        intent="commit"
                        icon={<KeyIcon />}
                        disabled={isGranting}
                        onClick={async () => {
                            setIsGranting(true);
                            setError(null);
                            try {
                                const response = await apiClient["api-keys"][
                                    ":id"
                                ]["grant-model"].$post({
                                    param: { id },
                                    json: { model },
                                });
                                if (!response.ok)
                                    throw new Error(await readError(response));
                                setOutcome("granted");
                            } catch (cause) {
                                setError(
                                    cause instanceof Error
                                        ? cause.message
                                        : "Couldn’t grant access.",
                                );
                            } finally {
                                setIsGranting(false);
                            }
                        }}
                    >
                        {isGranting ? "Allowing…" : "Allow model access"}
                    </Button>
                </>
            }
        >
            <Surface>
                <Text size="sm">Model requested</Text>
                <div className="break-words">
                    <Text size="sm" weight="semibold" tone="strong">
                        {model}
                    </Text>
                </div>
            </Surface>
            <Text size="sm">
                This model may spend Pollen when used. The key’s existing
                spending limit still applies.
            </Text>
            <InlineLink
                href={`/edit-key?id=${encodeURIComponent(id)}`}
                tone="quiet"
            >
                View current key permissions
            </InlineLink>
        </AuthFlowScreen>
    );
}
