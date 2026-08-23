import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    FieldStack,
    Input,
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
    emptyAgentForm,
    type ManagedAgent,
    type ModelListingFormState,
    type PromptAgentCommunityEndpoint,
    toAgentListingPayload,
    toAgentPayload,
} from "./types.ts";

type AgentDialogFormState = AgentFormState & ModelListingFormState;

type AgentDialogProps = {
    agent?: ManagedAgent;
    endpoint?: PromptAgentCommunityEndpoint;
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (
        agent: AgentPayload,
        listing: AgentListingDetailsPayload,
    ) => Promise<void>;
    onSync?: () => Promise<void>;
    trigger?: ReactNode;
};

export function AgentDialog({
    agent,
    endpoint,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
    onSync,
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
                      mcpServers: agent.mcpServers,
                      repositoryUrl: agent.source?.repositoryUrl ?? "",
                      manifestPath:
                          agent.source?.manifestPath ??
                          emptyAgentForm.manifestPath,
                  }
                : emptyAgentForm),
        });
        setError(null);
        setIsSubmitting(false);
    }, [open, agent, endpoint]);

    function updateAgentForm(
        key: keyof AgentFormState,
        value: string | AgentFormState["mcpServers"],
    ): void {
        setForm((current) => ({ ...current, [key]: value }));
    }

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit(
                toAgentPayload(form, form.visibility === "public"),
                toAgentListingPayload(form),
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

    async function handleSync(): Promise<void> {
        if (!onSync) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await onSync();
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "Agent sync failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const hasConfiguration =
        form.visibility === "public"
            ? form.repositoryUrl.trim() !== "" &&
              form.manifestPath.trim() !== ""
            : form.systemPrompt.trim() !== "" && form.baseModel.trim() !== "";
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        hasConfiguration;
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
                        allowPerUserRpm={false}
                        required
                        onChange={(key, value) =>
                            setForm((current) => ({
                                ...current,
                                [key]: value,
                            }))
                        }
                    />

                    <div className="border-t border-divider pt-4">
                        {form.visibility === "public" ? (
                            <div className="space-y-4">
                                <Alert
                                    intent="info"
                                    title="Public agents are imported from GitHub"
                                >
                                    Pollinations validates the manifest and runs
                                    the last valid, commit-pinned snapshot. The
                                    repository must be public and owned by your
                                    linked GitHub account.
                                </Alert>
                                <FieldStack
                                    label="GitHub repository"
                                    helper="A public repository owned by your linked GitHub account."
                                    alignLabelRow
                                >
                                    <Input
                                        type="url"
                                        name="prompt-agent-repository-url"
                                        value={form.repositoryUrl}
                                        placeholder="https://github.com/username/agent"
                                        disabled={isSubmitting}
                                        onChange={(event) =>
                                            updateAgentForm(
                                                "repositoryUrl",
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FieldStack>
                                <FieldStack
                                    label="Manifest path"
                                    helper="Relative path to the JSON agent configuration."
                                    alignLabelRow
                                >
                                    <Input
                                        name="prompt-agent-manifest-path"
                                        value={form.manifestPath}
                                        placeholder="pollinations-agent.json"
                                        disabled={isSubmitting}
                                        onChange={(event) =>
                                            updateAgentForm(
                                                "manifestPath",
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FieldStack>
                                {agent?.source && (
                                    <p className="break-all font-mono text-xs text-theme-text-muted">
                                        Synced commit {agent.source.commitSha}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <PromptAgentFields
                                form={form}
                                disabled={isSubmitting}
                                onChange={updateAgentForm}
                            />
                        )}
                    </div>
                </ScrollArea>
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-divider p-6 pt-4">
                    {agent?.source && onSync && (
                        <Button
                            type="button"
                            intent="info"
                            disabled={isSubmitting}
                            onClick={() => void handleSync()}
                        >
                            {isSubmitting ? "Syncing…" : "Sync from GitHub"}
                        </Button>
                    )}
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
