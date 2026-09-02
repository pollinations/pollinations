import {
    Alert,
    BeakerIcon,
    BotIcon,
    Button,
    FieldStack,
    GlobeIcon,
    InlineLink,
    Input,
    Section,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import {
    COMMUNITY_PROVIDER_NAME_MAX_LENGTH,
    COMMUNITY_PROVIDER_URL_MAX_LENGTH,
} from "@shared/community-endpoints.ts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { AgentDeleteConfirmation } from "./agent-delete-confirmation.tsx";
import { AgentDialog } from "./agent-dialog.tsx";
import { CommunityEndpointCard } from "./community-endpoint-card.tsx";
import { CommunityEndpointDeleteConfirmation } from "./community-endpoint-delete-confirmation.tsx";
import { CommunityEndpointDialog } from "./community-endpoint-dialog.tsx";
import { CommunityEndpointToggleConfirmation } from "./community-endpoint-toggle-confirmation.tsx";
import {
    type AgentListingDetailsPayload,
    type AgentPayload,
    type CommunityEndpoint,
    type CommunityProviderProfile,
    type EditableEndpoint,
    type EndpointPayload,
    type FallbackModelOption,
    type ManagedAgent,
    type PromptAgentCommunityEndpoint,
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

const PUBLISHER_ACCESS_REQUEST_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml";

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
    const [editing, setEditing] = useState<EditableEndpoint | null>(null);
    const [deleting, setDeleting] = useState<CommunityEndpoint | null>(null);
    const [toggling, setToggling] = useState<CommunityEndpoint | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [agentCreateOpen, setAgentCreateOpen] = useState(false);
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

    async function handleCreateAgent(
        payload: AgentPayload,
        listing: AgentListingDetailsPayload,
    ): Promise<void> {
        const response = await apiClient.account.agents.$post({
            json: { ...payload, ...listing },
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleUpdateAgent(
        payload: AgentPayload,
        listing: AgentListingDetailsPayload,
    ): Promise<void> {
        if (!editingAgent) return;
        const response = await apiClient.account.agents[":id"].$patch({
            param: { id: editingAgent.id },
            json: { ...payload, ...listing },
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
            await onChange?.();
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
            json: { ...payload, bearerToken },
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
        const { modality: _modality, ...proxyUpdate } = payload;
        const update =
            editing.type === "endpoint_agent"
                ? {
                      name: payload.name,
                      title: payload.title,
                      description: payload.description,
                      visibility: payload.visibility,
                      baseUrl: payload.baseUrl,
                      upstreamModel: payload.upstreamModel,
                      perUserRpm: payload.perUserRpm,
                  }
                : bearerToken
                  ? { ...proxyUpdate, bearerToken }
                  : proxyUpdate;
        const response = await apiClient.account["my-models"][
            ":id"
        ].update.$post({
            param: { id: editing.id },
            json: update,
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
                json: { hidden: !endpoint.hidden },
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

    const publisherAccessRequestLink = (
        <InlineLink href={PUBLISHER_ACCESS_REQUEST_URL} showIcon={false}>
            publisher access request
        </InlineLink>
    );

    const privateModelGuidance = (
        <>
            Your models are private — callable only by you and shown only when{" "}
            <strong>/models</strong> is authenticated with your API key. Public
            publishing is allowlist-only. To request publishing access for
            models, agents, or both, submit a {publisherAccessRequestLink}. You
            can register, probe, and test private models without approval. For
            questions, ask in{" "}
            <InlineLink
                href="https://discord.gg/pollinations-ai-885844321461485618"
                showIcon={false}
            >
                Discord
            </InlineLink>
            .
        </>
    );

    const endpointByAgentId = new Map<string, PromptAgentCommunityEndpoint>();
    const modelEndpoints: CommunityEndpoint[] = [];
    const agentEndpoints: CommunityEndpoint[] = [];
    for (const endpoint of endpoints) {
        if (endpoint.type === "prompt_agent") {
            endpointByAgentId.set(endpoint.id, endpoint);
            agentEndpoints.push(endpoint);
        } else if (endpoint.type === "endpoint_agent") {
            agentEndpoints.push(endpoint);
        } else {
            modelEndpoints.push(endpoint);
        }
    }
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    function renderEndpointCard(endpoint: CommunityEndpoint) {
        const agent =
            endpoint.type === "prompt_agent"
                ? agentById.get(endpoint.id)
                : undefined;
        return (
            <CommunityEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                isToggling={togglingId === endpoint.id}
                onToggle={() => setToggling(endpoint)}
                onEdit={() => {
                    if (agent) setEditingAgent(agent);
                    else if (endpoint.type !== "prompt_agent") {
                        setEditing(endpoint);
                    }
                }}
                onDelete={() => {
                    if (agent) setDeletingAgent(agent);
                    else setDeleting(endpoint);
                }}
            />
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                {canPublish && !isLoading && (
                    <Section title="Profile" framed>
                        <form
                            className="flex flex-col gap-4"
                            onSubmit={(event) =>
                                void handleProviderSubmit(event)
                            }
                        >
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
                                <FieldStack label="Website or privacy notice">
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
                        <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Shown on all your public deployments. Keep it
                                current so callers can review who operates the
                                endpoint and how request content is handled.
                            </span>
                        </p>
                    </Section>
                )}
                {error && <Alert intent="danger">{error}</Alert>}
                <Section
                    title="Agents"
                    framed
                    action={
                        <AgentDialog
                            open={agentCreateOpen}
                            onOpenChange={setAgentCreateOpen}
                            onSubmit={handleCreateAgent}
                            canPublish={canPublish}
                            trigger={
                                <Button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                                >
                                    <BotIcon className="h-4 w-4" />
                                    Add Agent
                                </Button>
                            }
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        {isLoading ? (
                            <Surface className="p-6 text-center text-sm text-theme-text-muted">
                                Loading…
                            </Surface>
                        ) : agentEndpoints.length === 0 ? (
                            <Surface className="p-6 text-center">
                                <BotIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                                <p className="mb-2 text-lg font-semibold">
                                    Create your first agent
                                </p>
                                <p className="text-sm text-theme-text-muted">
                                    Build a managed agent with a system prompt,
                                    model, and tools.
                                </p>
                            </Surface>
                        ) : (
                            agentEndpoints.map(renderEndpointCard)
                        )}
                    </div>
                    {!isLoading && !canPublish && (
                        <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Private agents do not need approval. To publish
                                agents for everyone in <strong>/models</strong>,
                                submit a {publisherAccessRequestLink} for agents
                                or both.
                            </span>
                        </p>
                    )}
                </Section>

                <Section
                    title="Models"
                    framed
                    action={
                        <CommunityEndpointDialog
                            open={createOpen}
                            onOpenChange={setCreateOpen}
                            onSubmit={handleCreate}
                            canPublish={canPublish}
                            fallbackOptions={fallbackOptions}
                            trigger={
                                <Button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                                >
                                    <BeakerIcon className="h-4 w-4" />
                                    Add Model
                                </Button>
                            }
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        {isLoading ? (
                            <Surface className="p-6 text-center text-sm text-theme-text-muted">
                                Loading…
                            </Surface>
                        ) : modelEndpoints.length === 0 ? (
                            <Surface className="p-6 text-center">
                                <BeakerIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                                <p className="mb-2 text-lg font-semibold">
                                    Add your first model
                                </p>
                                <p className="text-sm text-theme-text-muted">
                                    {canPublish
                                        ? "Register an OpenAI-compatible endpoint."
                                        : privateModelGuidance}
                                </p>
                            </Surface>
                        ) : (
                            modelEndpoints.map(renderEndpointCard)
                        )}
                    </div>
                    {!isLoading && modelEndpoints.length > 0 && (
                        <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                            <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                {canPublish ? (
                                    <>
                                        Private models are callable only by you
                                        and shown only when model lists use your
                                        API key. Make one public to list it for
                                        everyone in <strong>/models</strong> and
                                        bill callers at your configured pricing.
                                    </>
                                ) : (
                                    privateModelGuidance
                                )}
                            </span>
                        </p>
                    )}
                </Section>
            </div>

            {editing && (
                <CommunityEndpointDialog
                    key={editing.id}
                    endpoint={editing}
                    open
                    onOpenChange={(open) => !open && setEditing(null)}
                    onSubmit={handleUpdate}
                    canPublish={canPublish}
                    fallbackOptions={fallbackOptions}
                />
            )}

            <CommunityEndpointDeleteConfirmation
                endpoint={deleting}
                onConfirm={() => void handleDelete()}
                onCancel={() => setDeleting(null)}
            />
            <AgentDialog
                key={editingAgent?.id ?? "agent-edit-closed"}
                agent={editingAgent ?? undefined}
                endpoint={
                    editingAgent
                        ? endpointByAgentId.get(editingAgent.id)
                        : undefined
                }
                canPublish={canPublish}
                open={!!editingAgent}
                onOpenChange={(open) => !open && setEditingAgent(null)}
                onSubmit={handleUpdateAgent}
            />

            <AgentDeleteConfirmation
                agent={deletingAgent}
                onConfirm={() => void handleDeleteAgent()}
                onCancel={() => setDeletingAgent(null)}
            />

            <CommunityEndpointToggleConfirmation
                endpoint={toggling}
                onConfirm={() => {
                    if (!toggling) return;
                    void handleToggle(toggling);
                    setToggling(null);
                }}
                onCancel={() => setToggling(null)}
            />
        </>
    );
}
