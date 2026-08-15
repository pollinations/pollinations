import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    FieldStack,
    ScrollArea,
} from "@pollinations/ui";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ModelListingFields } from "./model-listing-fields.tsx";
import {
    type AgentListingFormState,
    type AgentListingPayload,
    agentListingToForm,
    type CommunityEndpoint,
    isValidPerUserRpm,
    type ManagedAgent,
    toAgentListingPayload,
} from "./types.ts";

export function ManagedAgentListingDialog({
    endpoint,
    agent,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
}: {
    endpoint?: CommunityEndpoint;
    agent: ManagedAgent;
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: AgentListingPayload) => Promise<void>;
}) {
    const isEdit = !!endpoint;
    const [form, setForm] = useState<AgentListingFormState>(() =>
        agentListingToForm(agent.id, endpoint),
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(agentListingToForm(agent.id, open ? endpoint : undefined));
        setError(null);
        setIsSubmitting(false);
    }, [open, endpoint, agent.id]);

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit(toAgentListingPayload(form));
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Agent listing save failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        isValidPerUserRpm(form.perUserRpm);

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="text-lg font-semibold">
                        {isEdit ? "Edit Agent Listing" : "List Agent"}
                    </DialogTitle>
                    {!isEdit && (
                        <span className="shrink-0 text-xs font-medium text-theme-text-muted">
                            Step 2 of 2
                        </span>
                    )}
                </div>
                <p className="mt-1 text-sm text-theme-text-muted">
                    Add the catalog details for this agent. Agent listings are
                    free and do not support fallback models.
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <ScrollArea className="min-h-0 flex-1 space-y-4 overscroll-contain px-6 pb-2">
                    {error && <Alert intent="danger">{error}</Alert>}

                    <FieldStack
                        label="Agent"
                        helper={
                            isEdit
                                ? "Edit agent behavior separately from its listing."
                                : "This listing will keep pointing at the same agent as its behavior changes."
                        }
                        alignLabelRow
                    >
                        <div className="rounded-md border border-divider bg-surface px-3 py-2">
                            <p className="text-sm font-medium text-theme-text-strong">
                                {agent.baseModel}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-theme-text-muted">
                                {agent.systemPrompt}
                            </p>
                        </div>
                    </FieldStack>

                    <ModelListingFields
                        form={form}
                        modality="text"
                        canPublish={canPublish}
                        isAgent
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
                </ScrollArea>

                <div className="flex shrink-0 justify-end gap-2 border-t border-divider p-6 pt-4">
                    <Button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        {isEdit ? "Cancel" : "Finish later"}
                    </Button>
                    <Button type="submit" intent="info" disabled={!canSubmit}>
                        {isSubmitting
                            ? "Saving…"
                            : isEdit
                              ? "Save Listing"
                              : form.visibility === "public"
                                ? "Publish Agent"
                                : "Add Private Agent"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
