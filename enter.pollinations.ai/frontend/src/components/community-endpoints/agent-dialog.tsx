import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    ScrollArea,
} from "@pollinations/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
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
    isValidPerUserRpm,
    type ManagedAgent,
    type McpServerRow,
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
        listing: AgentListingDetailsPayload | null,
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
                          ...server,
                          id: crypto.randomUUID(),
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
        key: keyof Omit<McpServerRow, "id">,
        value: string,
    ): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((row, rowIndex) =>
                rowIndex === index ? { ...row, [key]: value } : row,
            ),
        }));
    }

    function addMcpServer(): void {
        setForm((current) => ({
            ...current,
            mcpServers: [
                ...current.mcpServers,
                { id: crypto.randomUUID(), name: "", url: "" },
            ],
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
            await onSubmit(
                toAgentPayload(form),
                listingStarted ? toAgentListingPayload(form) : null,
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

    const listingStarted =
        !!endpoint ||
        form.name.trim() !== "" ||
        form.title.trim() !== "" ||
        form.description.trim() !== "" ||
        form.perUserRpm.trim() !== "" ||
        form.visibility === "public";
    const listingComplete =
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        isValidPerUserRpm(form.perUserRpm);
    const canSubmit =
        !isSubmitting &&
        form.systemPrompt.trim() !== "" &&
        form.baseModel.trim() !== "" &&
        form.mcpServers.every(isValidMcpRow) &&
        (!listingStarted || listingComplete);
    const submitLabel = endpoint
        ? "Save Agent"
        : listingStarted
          ? form.visibility === "public"
              ? "Publish Agent"
              : "Add Private Agent"
          : agent
            ? "Save Draft"
            : "Save Agent Draft";

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
                    model. Leave the listing fields empty to save a draft.
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
                        required={listingStarted}
                        onChange={(key, value) =>
                            setForm((current) => ({
                                ...current,
                                [key]: value,
                            }))
                        }
                        onInputModalitiesChange={(inputModalities) =>
                            setForm((current) => ({
                                ...current,
                                inputModalities,
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
                    />
                </ScrollArea>
                <div className="flex shrink-0 justify-end gap-2 border-t border-divider p-6 pt-4">
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" intent="info" disabled={!canSubmit}>
                        {isSubmitting ? "Saving…" : submitLabel}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
