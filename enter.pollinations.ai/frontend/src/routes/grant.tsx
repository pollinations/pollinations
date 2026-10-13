import {
    BotIcon,
    Button,
    InlineLink,
    KeyIcon,
    Surface,
    Text,
    XIcon,
} from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { CONSENT_PERMISSIONS } from "@shared/auth/authorize-config.ts";
import { parseCommunityModelId } from "@shared/community-endpoints.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { accountClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { accountPermissions } from "../components/keys/account-permissions-input.tsx";
import { KeySubject } from "../components/keys/key-subject.tsx";
import type { ApiKey } from "../components/keys/types.ts";
import {
    getCatalogDisplayName,
    getCatalogModelId,
} from "../components/models/model-catalog.ts";
import {
    CATEGORY_LABELS,
    MODEL_CATEGORY_ORDER,
} from "../components/models/model-categories.ts";
import type { ModelCategory } from "../components/models/types.ts";
import { useModelCatalog } from "../components/models/use-model-catalog.ts";
import {
    parseAppUrl,
    preferredReturnUrl,
    ReturnToApp,
} from "../lib/return-to-app.tsx";
import { updateApiKey } from "../lib/update-api-key.ts";

type GrantSearch = {
    id: string;
    /** The one model category, model ID or account permission the key was refused. */
    category?: ModelCategory;
    model?: string;
    permission?: (typeof CONSENT_PERMISSIONS)[number];
    /** The agent whose run was refused, with gen's signature over it. */
    agent?: string;
    sig?: string;
    redirect?: string;
};

/**
 * Approve one model category, model or account permission for an existing key, linked from
 * the 403s and chat replies gen returns when a key lacks it.
 */
export const Route = createFileRoute("/grant")({
    head: () => ({ meta: [{ title: "Allow access | pollinations.ai" }] }),
    validateSearch: (search: Record<string, unknown>): GrantSearch => ({
        id: typeof search.id === "string" ? search.id : "",
        category: MODEL_CATEGORY_ORDER.find((c) => c === search.category),
        model:
            typeof search.model === "string" && search.model
                ? search.model
                : undefined,
        permission: CONSENT_PERMISSIONS.find((p) => p === search.permission),
        agent: typeof search.agent === "string" ? search.agent : undefined,
        sig: typeof search.sig === "string" ? search.sig : undefined,
        redirect: parseAppUrl(search.redirect) ?? undefined,
    }),
    component: GrantPage,
});

/** The signed-in owner's key with this id, or null. */
async function loadKey(id: string): Promise<ApiKey | null> {
    const response = await accountClient.keys.$get();
    if (!response.ok) return null;
    const keys = (await response.json()).data as ApiKey[];
    return keys.find((item) => item.id === id) ?? null;
}

function GrantPage() {
    const { id, category, model, permission, agent, sig, redirect } =
        Route.useSearch();
    const navigate = useNavigate({ from: "/grant" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const userId = user?.id;
    const [key, setKey] = useState<ApiKey | null | undefined>();
    const [outcome, setOutcome] = useState<"pending" | "granted" | "declined">(
        "pending",
    );
    const [isGranting, setIsGranting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // undefined while enter checks the link's agent signature.
    const [askingAgent, setAskingAgent] = useState<string | null>();
    const catalog = useModelCatalog();
    const grant = useMemo(
        () =>
            category
                ? { category }
                : model
                  ? { model }
                  : permission
                    ? { permission }
                    : undefined,
        [category, model, permission],
    );
    // A category or a model ID goes into the key's model list.
    const modelEntry = category ?? model;
    const title = modelEntry ? "Allow model access" : "Allow account access";

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
        if (!userId || !id) return;
        let canceled = false;
        setKey(undefined);
        setOutcome("pending");
        setError(null);
        loadKey(id)
            .then((loaded) => {
                if (!canceled) setKey(loaded);
            })
            .catch(() => {
                if (!canceled) setKey(null);
            });
        return () => {
            canceled = true;
        };
    }, [userId, id]);

    useEffect(() => {
        if (!userId || !id || !grant || !agent || !sig) {
            setAskingAgent(null);
            return;
        }
        let canceled = false;
        setAskingAgent(undefined);
        accountClient.keys[":id"]["grant-agent"]
            .$get({ param: { id }, query: { ...grant, agent, sig } })
            .then((response) => (response.ok ? response.json() : null))
            .then((result) => {
                if (!canceled) setAskingAgent(result?.agent ?? null);
            })
            .catch(() => {
                if (!canceled) setAskingAgent(null);
            });
        return () => {
            canceled = true;
        };
    }, [userId, id, grant, agent, sig]);

    const displayName = (modelId: string) => {
        const listing = catalog.find(
            (item) => getCatalogModelId(item) === modelId,
        );
        return listing ? getCatalogDisplayName(listing, modelId) : modelId;
    };
    // Who asks sits on top: the key, then the agent gen signed for, if any.
    // What they ask for sits below the description.
    const subject = key ? (
        <>
            <KeySubject apiKey={key}>
                <Text size="sm">
                    <InlineLink
                        href={`/edit-key?id=${encodeURIComponent(id)}`}
                        tone="quiet"
                    >
                        View permissions
                    </InlineLink>
                </Text>
            </KeySubject>
            {askingAgent && (
                <AppAttribution
                    icon={<BotIcon className="h-4 w-4" />}
                    attribution={{
                        appName: displayName(askingAgent),
                        githubUsername:
                            parseCommunityModelId(askingAgent)
                                ?.ownerGithubUsername,
                    }}
                    redirectUrl={null}
                />
            )}
        </>
    ) : undefined;

    if (isPending) return <AuthModalLoading title={title} />;
    if (!user) {
        return (
            <SignInScreen
                title={title}
                description="Sign in as the key owner to review this request."
            />
        );
    }
    if (!id || !grant || key === null) {
        return (
            <AuthFlowScreen
                footnote="help"
                title={title}
                error="Couldn’t load this request. Check that you’re signed in as the key owner."
            />
        );
    }
    if (key === undefined || askingAgent === undefined) {
        return <AuthModalLoading title={title} />;
    }

    const models = key.permissions?.models;
    const alreadyAllowed = modelEntry
        ? !Array.isArray(models) || models.includes(modelEntry)
        : Boolean(permission && key.permissions?.account?.includes(permission));

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
                        ? "This key has the access it asked for. Retry your request in the app or conversation."
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
            title={`${title}?`}
            subject={subject}
            description="This adds only what’s shown below to this key, so anything else using the key gets it too. Its spending limit, expiry, and other permissions stay the same. You can remove it later from your Keys page."
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
                                // Re-read the key so a grant made since this
                                // page opened is kept. Only the asked-for entry
                                // is added; budget, expiry and the rest stay.
                                const current = await loadKey(id);
                                if (!current) {
                                    throw new Error("Couldn’t load this key.");
                                }
                                const models = current.permissions?.models;
                                const account =
                                    current.permissions?.account ?? [];
                                if (modelEntry) {
                                    // No model list already allows every model.
                                    if (
                                        Array.isArray(models) &&
                                        !models.includes(modelEntry)
                                    ) {
                                        await updateApiKey(id, {
                                            allowedModels: [
                                                ...models,
                                                modelEntry,
                                            ],
                                        });
                                    }
                                } else if (
                                    permission &&
                                    !account.includes(permission)
                                ) {
                                    await updateApiKey(id, {
                                        accountPermissions: [
                                            ...account,
                                            permission,
                                        ],
                                    });
                                }
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
                        {isGranting ? "Allowing…" : "Allow"}
                    </Button>
                </>
            }
        >
            <Surface>
                <Text size="sm">Asks for</Text>
                <div className="break-words">
                    <Text size="sm" weight="semibold" tone="strong">
                        {category
                            ? `${CATEGORY_LABELS[category]} models`
                            : model
                              ? displayName(model)
                              : accountPermissions.find(
                                    ({ id }) => id === permission,
                                )?.label}
                    </Text>
                </div>
            </Surface>
            {modelEntry && (
                <Text size="sm">
                    {category ? "These models" : "This model"} may spend Pollen
                    when used. The key’s existing spending limit still applies.
                </Text>
            )}
        </AuthFlowScreen>
    );
}
