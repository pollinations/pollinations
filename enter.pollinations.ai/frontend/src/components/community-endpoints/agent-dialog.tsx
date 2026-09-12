import {
    Button,
    Dialog,
    DialogTitle,
    Heading,
    ScrollArea,
    Text,
} from "@pollinations/ui";
import {
    AuthActionButtons,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ModelListingFields } from "./model-listing-fields.tsx";
import { PromptAgentFields } from "./prompt-agent-fields.tsx";
import { SafetyFeatureSelector } from "./safety-feature-selector.tsx";
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
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
    }, [error]);

    useEffect(() => {
        setForm({
            ...agentListingToForm(open ? endpoint : undefined),
            ...(open && agent
                ? {
                      systemPrompt: agent.systemPrompt,
                      baseModel: agent.baseModel,
                      requiredSafetyFeatures: agent.requiredSafetyFeatures,
                      mcpServers: agent.mcpServers,
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
            await onSubmit(toAgentPayload(form), toAgentListingPayload(form));
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
        form.baseModel.trim() !== "";
    const submitLabel = endpoint
        ? "Save Agent"
        : form.visibility === "public"
          ? "Publish Agent"
          : "Add Private Agent";

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen || !isSubmitting) onOpenChange(nextOpen);
            }}
            size="md"
            trigger={trigger}
            triggerAsChild
            layout="flow"
        >
            <div className="shrink-0 p-6 pb-4">
                <Heading as={DialogTitle} size="section">
                    {agent ? "Edit Agent" : "Add Agent"}
                </Heading>
                <Text
                    size="xs"
                    tone="soft"
                    weight="semibold"
                    className="polli:mt-1 polli:tracking-wide"
                >
                    Choose its instructions, model, and tools.
                </Text>
            </div>
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <ScrollArea className="min-h-0 flex-1 overscroll-contain px-6 pb-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
                    <fieldset
                        disabled={isSubmitting}
                        className="min-w-0 space-y-3"
                    >
                        {error && (
                            <div ref={errorRef}>
                                <ErrorBanner>{error}</ErrorBanner>
                            </div>
                        )}
                        <AuthInfoCard title={null}>
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
                        </AuthInfoCard>
                        <PromptAgentFields
                            form={form}
                            disabled={isSubmitting}
                            onChange={updateAgentForm}
                        />
                        <AuthInfoCard title={null}>
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
                        </AuthInfoCard>
                    </fieldset>
                </ScrollArea>
                <div className="p-6 pt-4 shrink-0">
                    <AuthActionButtons
                        secondaryAction={
                            <Button
                                type="button"
                                data-theme="neutral"
                                disabled={isSubmitting}
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                        }
                        actions={
                            <Button type="submit" disabled={!canSubmit}>
                                {isSubmitting ? "Saving…" : submitLabel}
                            </Button>
                        }
                    />
                </div>
            </form>
        </Dialog>
    );
}
