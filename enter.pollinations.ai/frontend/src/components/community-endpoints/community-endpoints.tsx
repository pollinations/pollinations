import {
    Alert,
    Button,
    Section,
    SparklesIcon,
    SproutIcon,
    Surface,
    TokensIcon,
} from "@pollinations/ui";
import { useCallback, useEffect, useState } from "react";
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
    type EndpointPayload,
    type ManagedAgent,
    readError,
} from "./types.ts";

type CommunityEndpointsProps = {
    onChange?: () => void | Promise<void>;
    // Allowlisted owners can make models public (set prices, list in /models).
    // Everyone else can only create and edit private, owner-only models.
    canPublish: boolean;
};

export function CommunityEndpoints({
    onChange,
    canPublish,
}: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [agents, setAgents] = useState<ManagedAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
        };
        const agentBody = (await agentResponse.json()) as {
            data: ManagedAgent[];
        };
        setEndpoints(endpointBody.data);
        setAgents(agentBody.data);
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

    return (
        <>
            {error && <Alert intent="danger">{error}</Alert>}
            <Section
                title="My Agents"
                framed
                action={
                    <AgentDialog
                        open={agentCreateOpen}
                        onOpenChange={setAgentCreateOpen}
                        onSubmit={handleCreateAgent}
                        trigger={
                            <Button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap"
                            >
                                <SparklesIcon className="h-4 w-4" />
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
                    ) : agents.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <SparklesIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Create your first agent
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                Define its prompt, base model, and optional MCP
                                servers. Register it as a model when it is
                                ready.
                            </p>
                        </Surface>
                    ) : (
                        agents.map((agent) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                registeredModelId={
                                    endpointByAgentId.get(agent.id)?.modelId
                                }
                                onRegister={() => {
                                    setRegisteringAgent(agent);
                                    setCreateOpen(true);
                                }}
                                onEdit={() => setEditingAgent(agent)}
                                onDelete={() => setDeletingAgent(agent)}
                            />
                        ))
                    )}
                </div>
            </Section>

            <Section
                title="My Models"
                framed
                action={
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
                        trigger={
                            <Button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap"
                            >
                                <SproutIcon className="h-4 w-4" />
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
                    ) : endpoints.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <SproutIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Register your first model
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                {canPublish
                                    ? "Publish an OpenAI-compatible text or image endpoint with your own pricing."
                                    : privateModelGuidance}
                            </p>
                        </Surface>
                    ) : (
                        endpoints.map((endpoint) => (
                            <CommunityEndpointCard
                                key={endpoint.id}
                                endpoint={endpoint}
                                isToggling={togglingId === endpoint.id}
                                onToggle={() => void handleToggle(endpoint)}
                                onEdit={() => setEditing(endpoint)}
                                onDelete={() => setDeleting(endpoint)}
                            />
                        ))
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
