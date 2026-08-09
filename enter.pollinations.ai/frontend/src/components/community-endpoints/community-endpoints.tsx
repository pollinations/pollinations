import {
    Alert,
    Button,
    FieldStack,
    Input,
    Section,
    SparklesIcon,
    SproutIcon,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import {
    COMMUNITY_PROVIDER_NAME_MAX_LENGTH,
    COMMUNITY_PROVIDER_URL_MAX_LENGTH,
} from "@shared/community-endpoints.ts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { AgentCard } from "./agent-card.tsx";
import { AgentDeleteConfirmation } from "./agent-delete-confirmation.tsx";
import { AgentDialog } from "./agent-dialog.tsx";
import { CommunityEndpointCard } from "./community-endpoint-card.tsx";
import { CommunityEndpointDeleteConfirmation } from "./community-endpoint-delete-confirmation.tsx";
import { CommunityEndpointDialog } from "./community-endpoint-dialog.tsx";
import {
    type AgentPayload,
    type CommunityEndpoint,
    type CommunityProviderProfile,
    type EndpointPayload,
    type FallbackModelOption,
    type ManagedAgent,
    readError,
} from "./types.ts";

type CommunityEndpointsProps = {
    onChange?: () => void | Promise<void>;
    // Allowlisted owners can make models public (set prices, list in /models).
    // Everyone else can only create and edit private, owner-only models.
    canPublish: boolean;
    // Public community models offered as fallback targets in the dialog.
    fallbackOptions: FallbackModelOption[];
};

export function CommunityEndpoints({
    onChange,
    canPublish,
    fallbackOptions,
}: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [agents, setAgents] = useState<ManagedAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [providerName, setProviderName] = useState("");
    const [providerUrl, setProviderUrl] = useState("");
    const [savedProvider, setSavedProvider] =
        useState<CommunityProviderProfile>({ name: null, url: null });
    const [isSavingProvider, setIsSavingProvider] = useState(false);
    const providerIsSaved =
        providerName === (savedProvider.name ?? "") &&
        providerUrl === (savedProvider.url ?? "");
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<CommunityEndpoint | null>(null);
    const [deleting, setDeleting] = useState<CommunityEndpoint | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [agentCreateOpen, setAgentCreateOpen] = useState(false);
    const [registeringAgent, setRegisteringAgent] =
        useState<ManagedAgent | null>(null);
    const [editingAgent, setEditingAgent] = useState<ManagedAgent | null>(null);
    const [deletingAgent, setDeletingAgent] = useState<ManagedAgent | null>(
        null,
    );

    const loadEndpoints = useCallback(async (): Promise<void> => {
        setError(null);
        const [endpointResponse, agentResponse] = await Promise.all([
            apiClient.account["my-models"].$get(),
            apiClient.account.agents.$get(),
        ]);
        if (!endpointResponse.ok || !agentResponse.ok) {
            setError(
                await readError(
                    endpointResponse.ok ? agentResponse : endpointResponse,
                ),
            );
            setIsLoading(false);
            return;
        }
        const endpointBody = (await endpointResponse.json()) as {
            data: CommunityEndpoint[];
            provider: CommunityProviderProfile;
        };
        const agentBody = (await agentResponse.json()) as {
            data: ManagedAgent[];
        };
        setEndpoints(endpointBody.data);
        setAgents(agentBody.data);
        setProviderName(endpointBody.provider.name ?? "");
        setProviderUrl(endpointBody.provider.url ?? "");
        setSavedProvider(endpointBody.provider);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadEndpoints();
    }, [loadEndpoints]);

    async function handleCreateAgent(payload: AgentPayload): Promise<void> {
        const response = await apiClient.account.agents.$post({
            json: payload,
        });
        if (!response.ok) throw new Error(await readError(response));
        const createdAgent = (await response.json()) as ManagedAgent;
        await loadEndpoints();
        setRegisteringAgent(createdAgent);
        setCreateOpen(true);
    }

    async function handleUpdateAgent(payload: AgentPayload): Promise<void> {
        if (!editingAgent) return;
        const response = await apiClient.account.agents[":id"].$patch({
            param: { id: editingAgent.id },
            json: payload,
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleDeleteAgent(): Promise<void> {
        if (!deletingAgent) return;
        const target = deletingAgent;
        setDeletingAgent(null);
        setError(null);
        try {
            const response = await apiClient.account.agents[":id"].$delete({
                param: { id: target.id },
            });
            if (!response.ok) throw new Error(await readError(response));
            await loadEndpoints();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Agent delete failed",
            );
        }
    }

    async function handleCreate(
        payload: EndpointPayload,
        bearerToken: string,
    ): Promise<void> {
        const response = await apiClient.account["my-models"].$post({
            // A prompt agent mints its own worker token; only self-hosted
            // endpoints carry a caller-supplied bearer token.
            json: bearerToken ? { ...payload, bearerToken } : payload,
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleUpdate(
        payload: EndpointPayload,
        bearerToken: string,
    ): Promise<void> {
        if (!editing) return;
        const response = await apiClient.account["my-models"][
            ":id"
        ].update.$post({
            param: { id: editing.id },
            json: bearerToken ? { ...payload, bearerToken } : payload,
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleDelete(): Promise<void> {
        if (!deleting) return;
        const target = deleting;
        setDeleting(null);
        setError(null);
        try {
            const response = await apiClient.account["my-models"][
                ":id"
            ].$delete({ param: { id: target.id } });
            if (!response.ok) throw new Error(await readError(response));
            await loadEndpoints();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint delete failed",
            );
        }
    }

    async function handleProviderSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        setIsSavingProvider(true);
        setError(null);
        try {
            const response = await apiClient.account[
                "my-models"
            ].provider.$post({
                json: { name: providerName, url: providerUrl },
            });
            if (!response.ok) throw new Error(await readError(response));
            const profile = (await response.json()) as CommunityProviderProfile;
            setProviderName(profile.name ?? "");
            setProviderUrl(profile.url ?? "");
            setSavedProvider(profile);
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Provider profile update failed",
            );
        } finally {
            setIsSavingProvider(false);
        }
    }

    async function handleToggle(endpoint: CommunityEndpoint): Promise<void> {
        setTogglingId(endpoint.id);
        setError(null);
        try {
            const response = await apiClient.account["my-models"][
                ":id"
            ].update.$post({
                param: { id: endpoint.id },
                json: { active: endpoint.disabled },
            });
            if (!response.ok) throw new Error(await readError(response));
            const updated = (await response.json()) as CommunityEndpoint;
            setEndpoints((current) =>
                current.map((item) =>
                    item.id === updated.id ? updated : item,
                ),
            );
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Model status update failed",
            );
        } finally {
            setTogglingId(null);
        }
    }

    const privateModelGuidance = (
        <>
            Your models are private — callable only by you and shown only when{" "}
            <strong>/models</strong> is authenticated with your API key. Enter
            the upstream model ID manually, then test the saved model by calling
            its model ID. Public publishing is allowlist-only. To request
            publishing access for your account, submit a{" "}
            <a
                href="https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-theme-text-strong"
            >
                community model publisher allowlist request
            </a>{" "}
            form. You can register and test private models without approval. For
            questions, ask in{" "}
            <a
                href="https://discord.gg/pollinations-ai-885844321461485618"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-theme-text-strong"
            >
                Discord
            </a>
            .
        </>
    );

    const endpointByAgentId = new Map(
        endpoints.flatMap((endpoint) =>
            endpoint.agentId ? [[endpoint.agentId, endpoint] as const] : [],
        ),
    );
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const unregisteredAgents = agents.filter(
        (agent) => !endpointByAgentId.has(agent.id),
    );
    const selectableAgents = editing?.agentId
        ? agents.filter(
              (agent) =>
                  agent.id === editing.agentId ||
                  !endpointByAgentId.has(agent.id),
          )
        : unregisteredAgents;
    const hasModels = endpoints.length > 0 || unregisteredAgents.length > 0;

    return (
        <>
            <Section
                title="My Models"
                framed
                action={
                    <div className="flex flex-wrap justify-end gap-2">
                        <AgentDialog
                            open={agentCreateOpen}
                            onOpenChange={setAgentCreateOpen}
                            onSubmit={handleCreateAgent}
                            trigger={
                                <Button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                                >
                                    <SparklesIcon className="h-4 w-4" />
                                    Add Agent
                                </Button>
                            }
                        />
                        <CommunityEndpointDialog
                            initialAgent={registeringAgent ?? undefined}
                            agents={unregisteredAgents}
                            open={createOpen}
                            onOpenChange={(open) => {
                                setCreateOpen(open);
                                if (!open) setRegisteringAgent(null);
                            }}
                            onSubmit={handleCreate}
                            canPublish={canPublish}
                            fallbackOptions={fallbackOptions}
                            trigger={
                                <Button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                                >
                                    <SproutIcon className="h-4 w-4" />
                                    Add Model
                                </Button>
                            }
                        />
                    </div>
                }
            >
                {canPublish && !isLoading && (
                    <Surface className="mb-3 p-4">
                        <form
                            className="flex flex-col gap-4"
                            onSubmit={(event) =>
                                void handleProviderSubmit(event)
                            }
                        >
                            <div>
                                <p className="text-sm font-semibold">Brand</p>
                                <p className="mt-0.5 text-xs text-theme-text-soft">
                                    Shown on all your public models.
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FieldStack label="Name">
                                    <Input
                                        name="community-provider-name"
                                        value={providerName}
                                        placeholder="Your service"
                                        autoComplete="organization"
                                        maxLength={
                                            COMMUNITY_PROVIDER_NAME_MAX_LENGTH
                                        }
                                        onChange={(event) =>
                                            setProviderName(event.target.value)
                                        }
                                    />
                                </FieldStack>
                                <FieldStack label="Website">
                                    <Input
                                        type="url"
                                        name="community-provider-url"
                                        value={providerUrl}
                                        placeholder="https://example.com"
                                        autoComplete="url"
                                        maxLength={
                                            COMMUNITY_PROVIDER_URL_MAX_LENGTH
                                        }
                                        onChange={(event) =>
                                            setProviderUrl(event.target.value)
                                        }
                                    />
                                </FieldStack>
                            </div>
                            <div>
                                <Button
                                    type="submit"
                                    disabled={
                                        isSavingProvider || providerIsSaved
                                    }
                                >
                                    {isSavingProvider ? "Saving…" : "Save"}
                                </Button>
                            </div>
                        </form>
                    </Surface>
                )}
                {error && (
                    <Alert intent="danger" className="mb-3">
                        {error}
                    </Alert>
                )}
                <div className="flex flex-col gap-3">
                    {isLoading ? (
                        <Surface className="p-6 text-center text-sm text-theme-text-muted">
                            Loading…
                        </Surface>
                    ) : !hasModels ? (
                        <Surface className="p-6 text-center">
                            <SproutIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Add your first model
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                {canPublish
                                    ? "Create a managed agent or register an OpenAI-compatible endpoint."
                                    : privateModelGuidance}
                            </p>
                        </Surface>
                    ) : (
                        <>
                            {unregisteredAgents.map((agent) => (
                                <AgentCard
                                    key={agent.id}
                                    agent={agent}
                                    onComplete={() => {
                                        setRegisteringAgent(agent);
                                        setCreateOpen(true);
                                    }}
                                    onEdit={() => setEditingAgent(agent)}
                                    onDelete={() => setDeletingAgent(agent)}
                                />
                            ))}
                            {endpoints.map((endpoint) => {
                                const agent = endpoint.agentId
                                    ? agentById.get(endpoint.agentId)
                                    : undefined;
                                return (
                                    <CommunityEndpointCard
                                        key={endpoint.id}
                                        endpoint={endpoint}
                                        isToggling={togglingId === endpoint.id}
                                        onToggle={() =>
                                            void handleToggle(endpoint)
                                        }
                                        onEditAgent={
                                            agent
                                                ? () => setEditingAgent(agent)
                                                : undefined
                                        }
                                        onEdit={() => setEditing(endpoint)}
                                        onDelete={() => setDeleting(endpoint)}
                                    />
                                );
                            })}
                        </>
                    )}
                </div>
                {!isLoading && endpoints.length > 0 && (
                    <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            {canPublish ? (
                                <>
                                    Private models are callable only by you and
                                    shown only when model lists use your API
                                    key. Make one public to list it for everyone
                                    in <strong>/models</strong> and bill callers
                                    at your configured pricing.
                                </>
                            ) : (
                                privateModelGuidance
                            )}
                        </span>
                    </p>
                )}
            </Section>

            <CommunityEndpointDialog
                key={editing?.id ?? "edit-closed"}
                endpoint={editing ?? undefined}
                agents={selectableAgents}
                open={!!editing}
                onOpenChange={(open) => !open && setEditing(null)}
                onSubmit={handleUpdate}
                canPublish={canPublish}
                fallbackOptions={fallbackOptions}
            />

            <CommunityEndpointDeleteConfirmation
                endpoint={deleting}
                onConfirm={() => void handleDelete()}
                onCancel={() => setDeleting(null)}
            />

            <AgentDialog
                key={editingAgent?.id ?? "agent-edit-closed"}
                agent={editingAgent ?? undefined}
                open={!!editingAgent}
                onOpenChange={(open) => !open && setEditingAgent(null)}
                onSubmit={handleUpdateAgent}
            />

            <AgentDeleteConfirmation
                agent={deletingAgent}
                onConfirm={() => void handleDeleteAgent()}
                onCancel={() => setDeletingAgent(null)}
            />
        </>
    );
}
