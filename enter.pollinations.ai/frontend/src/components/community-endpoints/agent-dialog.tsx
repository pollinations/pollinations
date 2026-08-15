import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    ScrollArea,
} from "@pollinations/ui";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import { getModelInputModalities } from "../models/model-info.ts";
import { ModelListingFields } from "./model-listing-fields.tsx";
import { PromptAgentFields } from "./prompt-agent-fields.tsx";
import {
    type AgentFormState,
    type AgentListingDetailsPayload,
    type AgentPayload,
    agentListingToForm,
    type CommunityEndpoint,
    emptyAgentForm,
    isValidMcpRow,
    type ManagedAgent,
    type ModelListingFormState,
    toAgentListingPayload,
    toAgentPayload,
} from "./types.ts";

type AgentDialogFormState = AgentFormState & ModelListingFormState;

type AgentDialogProps = {
    agent?: ManagedAgent;
    endpoint?: CommunityEndpoint;
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (
        agent: AgentPayload,
        listing: AgentListingDetailsPayload,
    ) => Promise<void>;
    trigger?: ReactNode;
};

export function AgentDialog({
    agent,
    endpoint,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
    trigger,
}: AgentDialogProps) {
    const [form, setForm] = useState<AgentDialogFormState>(() => ({
        ...agentListingToForm(),
        ...emptyAgentForm,
    }));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm({
            ...agentListingToForm(open ? endpoint : undefined),
            ...(open && agent
                ? {
                      systemPrompt: agent.systemPrompt,
                      baseModel: agent.baseModel,
                      pollinationsTools: agent.pollinationsTools,
                      mcpServers: agent.mcpServers.map((server) => ({
                          id: crypto.randomUUID(),
                          name: server.name,
                          url: server.url,
                          headers: Object.keys(server.headers).map((name) => ({
                              id: crypto.randomUUID(),
                              name,
                              value: "",
                              saved: true,
                          })),
                      })),
                  }
                : emptyAgentForm),
        });
        setError(null);
        setIsSubmitting(false);
    }, [open, agent, endpoint]);

    function updateAgentForm(
        key: keyof Omit<AgentFormState, "mcpServers">,
        value: string | boolean,
    ): void {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function updateMcpServer(
        index: number,
        key: "name" | "url",
        value: string,
    ): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((row, rowIndex) =>
                rowIndex === index
                    ? {
                          ...row,
                          [key]: value,
                          headers:
                              value !== row[key]
                                  ? row.headers.map((header) => ({
                                        ...header,
                                        saved: false,
                                    }))
                                  : row.headers,
                      }
                    : row,
            ),
        }));
    }

    function addMcpServer(): void {
        setForm((current) => ({
            ...current,
            mcpServers: [
                ...current.mcpServers,
                {
                    id: crypto.randomUUID(),
                    name: "",
                    url: "",
                    headers: [],
                },
            ],
        }));
    }

    function addMcpHeader(serverIndex: number): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((server, index) =>
                index === serverIndex
                    ? {
                          ...server,
                          headers: [
                              ...server.headers,
                              {
                                  id: crypto.randomUUID(),
                                  name: "",
                                  value: "",
                                  saved: false,
                              },
                          ],
                      }
                    : server,
            ),
        }));
    }

    function updateMcpHeader(
        serverIndex: number,
        headerIndex: number,
        key: "name" | "value",
        value: string,
    ): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((server, index) =>
                index === serverIndex
                    ? {
                          ...server,
                          headers: server.headers.map((header, index) =>
                              index === headerIndex
                                  ? {
                                        ...header,
                                        [key]: value,
                                        saved:
                                            key === "name" &&
                                            value !== header.name
                                                ? false
                                                : header.saved,
                                    }
                                  : header,
                          ),
                      }
                    : server,
            ),
        }));
    }

    function removeMcpHeader(serverIndex: number, headerIndex: number): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((server, index) =>
                index === serverIndex
                    ? {
                          ...server,
                          headers: server.headers.filter(
                              (_, index) => index !== headerIndex,
                          ),
                      }
                    : server,
            ),
        }));
    }

    function removeMcpServer(index: number): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.filter((_, i) => i !== index),
        }));
    }

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const inputModalities = await inheritedInputModalities(
                form.baseModel,
            );
            await onSubmit(
                toAgentPayload(form),
                toAgentListingPayload(form, inputModalities),
            );
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "Agent save failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        form.systemPrompt.trim() !== "" &&
        form.baseModel.trim() !== "" &&
        form.mcpServers.every(isValidMcpRow);
    const submitLabel = endpoint
        ? "Save Agent"
        : form.visibility === "public"
          ? "Publish Agent"
          : "Add Private Agent";

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <DialogTitle className="text-lg font-semibold">
                    {agent ? "Edit Agent" : "Add Agent"}
                </DialogTitle>
                <p className="mt-1 text-sm text-theme-text-muted">
                    Configure and list an agent as a{" "}
                    <code>
                        {"{username}"}/{"{model-id}"}
                    </code>{" "}
                    model.
                </p>
            </div>
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <ScrollArea className="min-h-0 flex-1 space-y-4 overscroll-contain px-6 pb-2">
                    {error && <Alert intent="danger">{error}</Alert>}

                    <ModelListingFields
                        form={form}
                        modality="text"
                        canPublish={canPublish}
                        isAgent
                        required
                        onChange={(key, value) =>
                            setForm((current) => ({
                                ...current,
                                [key]: value,
                            }))
                        }
                    />

                    <div className="border-t border-divider pt-4">
                        <p className="text-sm font-semibold text-theme-text-strong">
                            Agent details
                        </p>
                        <p className="mt-0.5 text-xs text-theme-text-muted">
                            Choose the model, instructions, and tools used on
                            every request.
                        </p>
                    </div>

                    <PromptAgentFields
                        form={form}
                        disabled={isSubmitting}
                        onChange={updateAgentForm}
                        onAddMcp={addMcpServer}
                        onUpdateMcp={updateMcpServer}
                        onRemoveMcp={removeMcpServer}
                        onAddMcpHeader={addMcpHeader}
                        onUpdateMcpHeader={updateMcpHeader}
                        onRemoveMcpHeader={removeMcpHeader}
                    />
                </ScrollArea>
                <div className="flex shrink-0 justify-end gap-2 border-t border-divider p-6 pt-4">
                    <Button
                        type="button"
                        intent="danger"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!canSubmit}>
                        {isSubmitting ? "Saving…" : submitLabel}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}

async function inheritedInputModalities(
    baseModelId: string,
): Promise<ModelInputModality[]> {
    try {
        const models = getModelPricesFromCatalog(await fetchModelCatalog());
        const baseModel = models.find(
            (model) => model.name === baseModelId.trim(),
        );
        return baseModel ? getModelInputModalities(baseModel) : ["text"];
    } catch {
        return ["text"];
    }
}
