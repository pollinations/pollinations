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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AppAttribution } from "../components/auth/app-attribution.tsx";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { readError } from "../components/community-endpoints/types.ts";
import { accountPermissions } from "../components/keys/account-permissions-input.tsx";
import { KeySubject } from "../components/keys/key-subject.tsx";
import type { ApiKey } from "../components/keys/types.ts";
import {
    getCatalogDisplayName,
    getCatalogModelId,
} from "../components/models/model-catalog.ts";
import { getCommunityModelOwner } from "../components/models/model-categories.ts";
import { useModelCategories } from "../components/models/use-model-categories.ts";
import { useOwnCommunityModels } from "../components/models/use-own-community-models.ts";
import {
    parseAppUrl,
    preferredReturnUrl,
    ReturnToApp,
} from "../lib/return-to-app.tsx";

type GrantSearch = {
    id: string;
    /** One model or one account permission the key was refused. */
    model?: string;
    permission?: (typeof CONSENT_PERMISSIONS)[number];
    /** The agent whose run was refused, with gen's signature over it. */
    agent?: string;
    sig?: string;
    redirect?: string;
};

/**
 * Approve one model or account permission for an existing key, linked from
 * the 403s and chat replies gen returns when a key lacks it.
 */
export const Route = createFileRoute("/grant")({
    head: () => ({ meta: [{ title: "Allow access | pollinations.ai" }] }),
    validateSearch: (search: Record<string, unknown>): GrantSearch => ({
        id: typeof search.id === "string" ? search.id : "",
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

function GrantPage() {
    const { id, model, permission, agent, sig, redirect } = Route.useSearch();
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
    const { catalog } = useModelCategories(useOwnCommunityModels(!!userId));
    const grant = useMemo(
        () => (model ? { model } : permission ? { permission } : undefined),
        [model, permission],
    );
    const title = model ? "Allow model access" : "Allow account access";

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
    }, [userId, id]);

    useEffect(() => {
        if (!userId || !id || !grant || !agent || !sig) {
            setAskingAgent(null);
            return;
        }
        let canceled = false;
        setAskingAgent(undefined);
        apiClient["api-keys"][":id"]["grant-agent"]
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

    const subject = key ? (
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

    const requested = (
        <>
            <Text size="sm">{model ? "Wants to use" : "Wants to"}</Text>
            <div className="break-words">
                <Text size="sm" weight="semibold" tone="strong">
                    {model ??
                        accountPermissions.find(({ id }) => id === permission)
                            ?.label}
                </Text>
            </div>
        </>
    );
    const agentListing = catalog.find(
        (item) => getCatalogModelId(item) === askingAgent,
    );
    // Every flow shows the key first. A request gen signed for an agent names
    // the agent inside the request, since the grant still goes to the key.
    const request = askingAgent ? (
        <AppAttribution
            icon={<BotIcon className="h-4 w-4" />}
            attribution={{
                appName: agentListing
                    ? getCatalogDisplayName(agentListing, askingAgent)
                    : askingAgent,
                githubUsername: getCommunityModelOwner(askingAgent),
            }}
            redirectUrl={null}
        >
            {requested}
        </AppAttribution>
    ) : (
        <Surface>{requested}</Surface>
    );
    const alreadyAllowed = model
        ? !Array.isArray(key.permissions?.models) ||
          key.permissions.models.includes(model)
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
                                const response = await apiClient["api-keys"][
                                    ":id"
                                ].grant.$post({
                                    param: { id },
                                    json: grant,
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
                        {isGranting ? "Allowing…" : "Allow"}
                    </Button>
                </>
            }
        >
            {request}
            {model && (
                <Text size="sm">
                    This model may spend Pollen when used. The key’s existing
                    spending limit still applies.
                </Text>
            )}
        </AuthFlowScreen>
    );
}
