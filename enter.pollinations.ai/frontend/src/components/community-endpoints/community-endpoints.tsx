import {
    AccountIcon,
    Alert,
    BeakerIcon,
    BotIcon,
    Button,
    Field,
    GlobeIcon,
    ImageIcon,
    InfoTip,
    InlineLink,
    Input,
    PlusIcon,
    Section,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import {
    COMMUNITY_PROVIDER_NAME_MAX_LENGTH,
    COMMUNITY_PROVIDER_URL_MAX_LENGTH,
} from "@shared/community-endpoints.ts";
import {
    type FormEvent,
    type ReactElement,
    useCallback,
    useEffect,
    useState,
} from "react";
import { apiClient } from "../../api.ts";
import { resourceActionError } from "../../lib/resource-action-error.ts";
import { LoadError, SectionContent } from "../layout/dashboard-loading.tsx";
import { AgentDeleteConfirmation } from "./agent-delete-confirmation.tsx";
import { AgentDialog } from "./agent-dialog.tsx";
import { CommunityEndpointCard } from "./community-endpoint-card.tsx";
import { CommunityEndpointDeleteConfirmation } from "./community-endpoint-delete-confirmation.tsx";
import { CommunityEndpointDialog } from "./community-endpoint-dialog.tsx";
import { CommunityEndpointToggleConfirmation } from "./community-endpoint-toggle-confirmation.tsx";
import {
    type AgentFormState,
    type CommunityEndpoint,
    type CommunityProviderProfile,
    type EditableEndpoint,
    type EndpointPayload,
    type FallbackModelOption,
    type ManagedAgent,
    readError,
    toAgentPayload,
    toAgentUpdatePayload,
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

function ProviderProfileField({
    icon,
    label,
    help,
    children,
}: {
    icon: ReactElement;
    label: string;
    help: string;
    children: ReactElement;
}) {
    return (
        <Field.Root className="grid gap-2 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex items-center gap-2">
                <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-theme-text-strong [&>svg]:h-4 [&>svg]:w-4"
                >
                    {icon}
                </span>
                <span className="inline-flex items-center">
                    <Field.Label className="text-sm font-semibold leading-5 text-theme-text-strong">
                        {label}
                    </Field.Label>
                    <InfoTip text={help} label={`${label} information`} />
                </span>
            </span>
            <Field.Input asChild>{children}</Field.Input>
        </Field.Root>
    );
}

export function DeploymentsPlaceholder({
    canPublish = false,
    error,
    onRetry,
}: {
    canPublish?: boolean;
    error?: string | null;
    onRetry?: () => void;
}) {
    const titles = canPublish
        ? ["Publisher info", "Agents", "Models"]
        : ["Agents", "Models"];
    return (
        <div className="flex flex-col gap-6">
            {titles.map((title) => (
                <Section key={title} title={title}>
                    <SectionContent
                        loading={!error}
                        label={`Loading ${title.toLowerCase()}…`}
                    >
                        {error && (
                            <LoadError onRetry={onRetry}>{error}</LoadError>
                        )}
                    </SectionContent>
                </Section>
            ))}
        </div>
    );
}

export function CommunityEndpoints({
    onChange,
    canPublish,
    fallbackOptions,
}: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [agents, setAgents] = useState<ManagedAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [providerName, setProviderName] = useState("");
    const [providerUrl, setProviderUrl] = useState("");
    const [providerIconUrl, setProviderIconUrl] = useState("");
    const [savedProvider, setSavedProvider] =
        useState<CommunityProviderProfile>({
            name: null,
            url: null,
            iconUrl: null,
        });
    const [isSavingProvider, setIsSavingProvider] = useState(false);
    const providerIsSaved =
        providerName === (savedProvider.name ?? "") &&
        providerUrl === (savedProvider.url ?? "") &&
        providerIconUrl === (savedProvider.iconUrl ?? "");
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
        try {
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
            setProviderIconUrl(endpointBody.provider.iconUrl ?? "");
            setSavedProvider(endpointBody.provider);
            setHasLoaded(true);
        } catch {
            setError("Couldn’t load models and agents.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEndpoints();
    }, [loadEndpoints]);

    async function handleCreateAgent(form: AgentFormState): Promise<void> {
        const response = await apiClient.account.agents.$post({
            json: toAgentPayload(form),
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
    }

    async function handleUpdateAgent(form: AgentFormState): Promise<void> {
        if (!editingAgent) return;
        const response = await apiClient.account.agents[":id"].$patch({
            param: { id: editingAgent.id },
            json: toAgentUpdatePayload(form),
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
            setError(resourceActionError("delete", "the agent", thrown));
        }
    }

    async function handleSyncAgent(): Promise<void> {
        if (!editingAgent) return;
        const response = await apiClient.account.agents[":id"].sync.$post({
            param: { id: editingAgent.id },
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadEndpoints();
        await onChange?.();
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
            editing.type === "endpoint_agent" && payload.modality === "text"
                ? {
                      name: payload.name,
                      title: payload.title,
                      description: payload.description,
                      visibility: payload.visibility,
                      api: payload.api,
                      url: payload.url,
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
                resourceActionError(
                    "delete",
                    target.type === "proxy" ? "the model" : "the agent",
                    thrown,
                ),
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
                json: {
                    name: providerName,
                    url: providerUrl,
                    iconUrl: providerIconUrl.trim() || null,
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const profile = (await response.json()) as CommunityProviderProfile;
            setProviderName(profile.name ?? "");
            setProviderUrl(profile.url ?? "");
            setProviderIconUrl(profile.iconUrl ?? "");
            setSavedProvider(profile);
            await onChange?.();
        } catch (thrown) {
            setError(resourceActionError("save", "publisher info", thrown));
        } finally {
            setIsSavingProvider(false);
        }
    }

    function resetProviderChanges(): void {
        setProviderName(savedProvider.name ?? "");
        setProviderUrl(savedProvider.url ?? "");
        setProviderIconUrl(savedProvider.iconUrl ?? "");
        setError(null);
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
                resourceActionError(
                    "update",
                    endpoint.type === "proxy"
                        ? "the model’s visibility"
                        : "the agent’s visibility",
                    thrown,
                ),
            );
        } finally {
            setTogglingId(null);
        }
    }

    const publisherAccessRequestLink = (
        <InlineLink href={PUBLISHER_ACCESS_REQUEST_URL}>
            publisher access request
        </InlineLink>
    );

    const privateModelGuidance = (
        <>
            Your models are private — callable only by you and shown only when{" "}
            <strong>/models</strong> is authenticated with your key. Public
            publishing is allowlist-only. To request publishing access for
            models, agents, or both, submit a {publisherAccessRequestLink}. You
            can register, probe, and test private models without approval. For
            questions, ask in{" "}
            <InlineLink href="https://discord.gg/pollinations-ai-885844321461485618">
                Discord
            </InlineLink>
            .
        </>
    );

    const modelEndpoints: CommunityEndpoint[] = [];
    const agentEndpoints: CommunityEndpoint[] = [];
    for (const endpoint of endpoints) {
        if (endpoint.type === "proxy") {
            modelEndpoints.push(endpoint);
        } else {
            agentEndpoints.push(endpoint);
        }
    }
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    function renderEndpointCard(endpoint: CommunityEndpoint) {
        const agent =
            endpoint.type === "prompt_agent" || endpoint.type === "code_agent"
                ? agentById.get(endpoint.id)
                : undefined;
        return (
            <CommunityEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                agent={agent}
                isToggling={togglingId === endpoint.id}
                onToggle={() => setToggling(endpoint)}
                onEdit={
                    agent
                        ? () =>
                              setEditingAgent({
                                  ...agent,
                                  visibility: endpoint.visibility,
                              })
                        : endpoint.type === "proxy" ||
                            endpoint.type === "endpoint_agent"
                          ? () => setEditing(endpoint)
                          : undefined
                }
                onDelete={() => {
                    if (agent) setDeletingAgent(agent);
                    else setDeleting(endpoint);
                }}
            />
        );
    }

    const agentAction = (
        <Button
            type="button"
            className="dashboard-add-button"
            aria-label="Create agent"
            title="Create agent"
            aria-haspopup="dialog"
            onClick={() => setAgentCreateOpen(true)}
        >
            <PlusIcon className="h-4 w-4" />
            <BotIcon className="h-5 w-5" />
        </Button>
    );
    const modelAction = (
        <Button
            type="button"
            className="dashboard-add-button"
            aria-label="Create model"
            title="Create model"
            aria-haspopup="dialog"
            onClick={() => setCreateOpen(true)}
        >
            <PlusIcon className="h-4 w-4" />
            <BeakerIcon className="h-5 w-5" />
        </Button>
    );

    if (isLoading || (error && !hasLoaded)) {
        return (
            <DeploymentsPlaceholder
                canPublish={canPublish}
                error={isLoading ? null : error}
                onRetry={() => {
                    setIsLoading(true);
                    void loadEndpoints();
                }}
            />
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                {canPublish && (
                    <Section title="Publisher info">
                        <form
                            className="flex flex-col gap-4"
                            onSubmit={(event) =>
                                void handleProviderSubmit(event)
                            }
                        >
                            <div className="space-y-3">
                                <ProviderProfileField
                                    icon={<AccountIcon />}
                                    label="Publisher name"
                                    help="Shown as the publisher on all your public models."
                                >
                                    <Input
                                        name="community-provider-name"
                                        value={providerName}
                                        placeholder="Your service"
                                        autoComplete="organization"
                                        className="w-full min-w-0"
                                        required={Boolean(providerUrl.trim())}
                                        maxLength={
                                            COMMUNITY_PROVIDER_NAME_MAX_LENGTH
                                        }
                                        onChange={(event) =>
                                            setProviderName(event.target.value)
                                        }
                                    />
                                </ProviderProfileField>
                                <ProviderProfileField
                                    icon={<GlobeIcon />}
                                    label="Website or privacy policy"
                                    help="Shown with your public models. Use one HTTPS link to your website or privacy policy; set it together with Publisher name."
                                >
                                    <Input
                                        type="url"
                                        name="community-provider-url"
                                        value={providerUrl}
                                        placeholder="https://example.com"
                                        autoComplete="url"
                                        className="w-full min-w-0"
                                        required={Boolean(providerName.trim())}
                                        maxLength={
                                            COMMUNITY_PROVIDER_URL_MAX_LENGTH
                                        }
                                        onChange={(event) =>
                                            setProviderUrl(event.target.value)
                                        }
                                    />
                                </ProviderProfileField>
                                <ProviderProfileField
                                    icon={<ImageIcon />}
                                    label="Brand icon URL"
                                    help="Upload an SVG with polli upload icon.svg or POST to https://media.pollinations.ai/upload. Paste the returned URL."
                                >
                                    <Input
                                        type="url"
                                        name="community-provider-icon-url"
                                        value={providerIconUrl}
                                        placeholder="https://media.pollinations.ai/…"
                                        autoComplete="url"
                                        className="w-full min-w-0"
                                        onChange={(event) =>
                                            setProviderIconUrl(
                                                event.target.value,
                                            )
                                        }
                                    />
                                </ProviderProfileField>
                            </div>
                            {!providerIsSaved && (
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="button"
                                        intent="neutral"
                                        disabled={isSavingProvider}
                                        onClick={resetProviderChanges}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        intent="commit"
                                        disabled={isSavingProvider}
                                    >
                                        {isSavingProvider ? "Saving…" : "Save"}
                                    </Button>
                                </div>
                            )}
                        </form>
                    </Section>
                )}
                {error && <Alert intent="danger">{error}</Alert>}
                <Section
                    title="Agents"
                    id="agents"
                    action={agentEndpoints.length > 0 && agentAction}
                >
                    <div className="flex flex-col gap-3">
                        {agentEndpoints.length === 0 ? (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{agentAction}</div>
                                <p className="text-sm text-theme-text-muted">
                                    Build from a prompt and model, or deploy
                                    agent.ts from GitHub.
                                </p>
                            </Surface>
                        ) : (
                            agentEndpoints.map(renderEndpointCard)
                        )}
                    </div>
                    {!canPublish && (
                        <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Private agents do not need approval. Public
                                agents require publishing access. Request it
                                through the {publisherAccessRequestLink}.
                            </span>
                        </p>
                    )}
                </Section>

                <Section
                    title="Models"
                    id="models"
                    action={modelEndpoints.length > 0 && modelAction}
                >
                    <div className="flex flex-col gap-3">
                        {modelEndpoints.length === 0 ? (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{modelAction}</div>
                                {canPublish && (
                                    <p className="text-sm text-theme-text-muted">
                                        Register an OpenAI-compatible endpoint.
                                    </p>
                                )}
                            </Surface>
                        ) : (
                            modelEndpoints.map(renderEndpointCard)
                        )}
                    </div>
                    {(modelEndpoints.length > 0 || !canPublish) && (
                        <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                            <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                {canPublish ? (
                                    <>
                                        Private models are callable only by you
                                        and shown only when model lists use your
                                        key. Make one public to list it for
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
                canPublish={canPublish}
                open={!!editingAgent}
                onOpenChange={(open) => !open && setEditingAgent(null)}
                onSubmit={handleUpdateAgent}
                onSync={handleSyncAgent}
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
            <AgentDialog
                open={agentCreateOpen}
                onOpenChange={setAgentCreateOpen}
                onSubmit={handleCreateAgent}
                canPublish={canPublish}
            />
            <CommunityEndpointDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSubmit={handleCreate}
                canPublish={canPublish}
                fallbackOptions={fallbackOptions}
            />
        </>
    );
}
