import {
    Alert,
    Button,
    ButtonGroup,
    CheckIcon,
    Dialog,
    DialogTitle,
    FieldStack,
    ScrollArea,
    TabButton,
} from "@pollinations/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { CodeAgentFields } from "./code-agent-fields.tsx";
import { ModelListingFields } from "./model-listing-fields.tsx";
import { PromptAgentFields } from "./prompt-agent-fields.tsx";
import { SafetyFeatureSelector } from "./safety-feature-selector.tsx";
import {
    type AgentFormState,
    agentToForm,
    type ManagedAgent,
} from "./types.ts";

type AgentDialogProps = {
    agent?: ManagedAgent;
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (form: AgentFormState) => Promise<void>;
    trigger?: ReactNode;
};

export function AgentDialog({
    agent,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
    trigger,
}: AgentDialogProps) {
    const [form, setForm] = useState(() => agentToForm(agent));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(agentToForm(open ? agent : undefined));
        setError(null);
        setIsSubmitting(false);
    }, [open, agent]);

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
            await onSubmit(form);
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "Agent save failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const hasRuntimeConfiguration =
        form.type === "code_agent"
            ? form.repository.trim() !== ""
            : form.systemPrompt.trim() !== "" && form.baseModel.trim() !== "";
    const canSubmit =
        !isSubmitting &&
        (form.type === "code_agent" ||
            (form.name.trim() !== "" && form.title.trim() !== "")) &&
        hasRuntimeConfiguration;
    const submitLabel = agent
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

                    {!agent && (
                        <FieldStack
                            label="Agent type"
                            helper={
                                "Use a prompt and model, or deploy code from GitHub."
                            }
                            alignLabelRow
                        >
                            <ButtonGroup aria-label="Agent type">
                                <TabButton
                                    active={form.type === "prompt_agent"}
                                    disabled={isSubmitting}
                                    onClick={() =>
                                        setForm((current) => ({
                                            ...current,
                                            type: "prompt_agent",
                                        }))
                                    }
                                    size="sm"
                                    className="min-w-28 gap-1.5"
                                >
                                    {form.type === "prompt_agent" && (
                                        <CheckIcon className="h-3.5 w-3.5" />
                                    )}
                                    Prompt agent
                                </TabButton>
                                <TabButton
                                    active={form.type === "code_agent"}
                                    disabled={isSubmitting}
                                    onClick={() =>
                                        setForm((current) => ({
                                            ...current,
                                            type: "code_agent",
                                        }))
                                    }
                                    size="sm"
                                    className="min-w-28 gap-1.5"
                                >
                                    {form.type === "code_agent" && (
                                        <CheckIcon className="h-3.5 w-3.5" />
                                    )}
                                    Code agent
                                </TabButton>
                            </ButtonGroup>
                        </FieldStack>
                    )}

                    <ModelListingFields
                        form={form}
                        modality="text"
                        canPublish={canPublish}
                        isAgent
                        allowPerUserRpm={false}
                        hideIdentity={form.type === "code_agent"}
                        required
                        onChange={(key, value) =>
                            setForm((current) => ({
                                ...current,
                                [key]: value,
                            }))
                        }
                    />

                    {form.type === "code_agent" && (
                        <p className="text-sm text-theme-text-muted">
                            The repository name becomes the model ID and title.
                            Its description becomes the catalog description.
                        </p>
                    )}

                    <SafetyFeatureSelector
                        value={form.requiredSafetyFeatures}
                        disabled={isSubmitting}
                        onChange={(requiredSafetyFeatures) =>
                            setForm((current) => ({
                                ...current,
                                requiredSafetyFeatures,
                            }))
                        }
                    />

                    <div className="space-y-4 border-t border-divider pt-4">
                        {form.type === "code_agent" ? (
                            <CodeAgentFields
                                form={form}
                                disabled={isSubmitting || !!agent}
                                onChange={(field, value) =>
                                    setForm((current) => ({
                                        ...current,
                                        [field]: value,
                                    }))
                                }
                            />
                        ) : (
                            <PromptAgentFields
                                form={form}
                                disabled={isSubmitting}
                                onChange={updateAgentForm}
                            />
                        )}
                    </div>
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
