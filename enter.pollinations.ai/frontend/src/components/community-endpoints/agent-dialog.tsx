import {
    Alert,
    BotIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogHeader,
    InlineLink,
    TabButton,
    XIcon,
} from "@pollinations/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { AgentFormRow } from "./agent-form-row.tsx";
import { CodeAgentFields } from "./code-agent-fields.tsx";
import { ModelListingFields } from "./model-listing-fields.tsx";
import { PromptAgentFields, PromptAgentTools } from "./prompt-agent-fields.tsx";
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
    onSync?: () => Promise<void>;
    trigger?: ReactNode;
};

export function AgentDialog({
    agent,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
    onSync,
    trigger,
}: AgentDialogProps) {
    const [form, setForm] = useState(() => agentToForm(agent));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">(
        "idle",
    );

    useEffect(() => {
        setForm(agentToForm(open ? agent : undefined));
        setError(null);
        setIsSubmitting(false);
        setSyncStatus("idle");
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

    async function handleSync(): Promise<void> {
        if (!onSync) return;
        setSyncStatus("syncing");
        setError(null);
        try {
            await onSync();
            setSyncStatus("synced");
        } catch (thrown) {
            setSyncStatus("idle");
            setError(
                thrown instanceof Error ? thrown.message : "Agent sync failed",
            );
        }
    }

    const hasRuntimeConfiguration =
        form.type === "code_agent"
            ? form.repository.trim() !== ""
            : form.systemPrompt.trim() !== "" && form.baseModel.trim() !== "";
    const canSubmit =
        !isSubmitting &&
        syncStatus !== "syncing" &&
        (form.type === "code_agent" ||
            (form.name.trim() !== "" && form.title.trim() !== "")) &&
        hasRuntimeConfiguration;
    const submitLabel = agent ? "Save changes" : "Create agent";

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
            contentClassName="polli:sm:bg-transparent polli:sm:rounded-none polli:sm:shadow-none"
        >
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <DialogBody>
                    <DialogHeader
                        inBody
                        title={agent ? "Edit agent" : "Create agent"}
                        description={
                            <>
                                Choose a prompt and model, or deploy code from
                                GitHub.{" "}
                                {!agent && (
                                    <InlineLink
                                        href={genDocsUrl(
                                            "#tag/publish-an-agent",
                                        )}
                                    >
                                        Read the guide
                                    </InlineLink>
                                )}
                            </>
                        }
                    />
                    {error && <Alert intent="danger">{error}</Alert>}

                    {!agent && (
                        <div>
                            <AgentFormRow
                                label="Agent type"
                                help="Prompt agents use a model and instructions. Code agents deploy a public GitHub repository."
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
                            </AgentFormRow>
                        </div>
                    )}

                    <div
                        className={
                            agent
                                ? "space-y-3"
                                : "space-y-3 border-t border-divider pt-4"
                        }
                    >
                        {form.type === "code_agent" && (
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
                        )}

                        <ModelListingFields
                            form={form}
                            canPublish={canPublish}
                            isAgent
                            hideIdentity={form.type === "code_agent"}
                            required
                            onChange={(key, value) =>
                                setForm((current) => ({
                                    ...current,
                                    [key]: value,
                                }))
                            }
                        />
                    </div>
                    {(form.type === "prompt_agent" ||
                        (agent?.type === "code_agent" && onSync)) && (
                        <div className="border-t border-divider pt-4">
                            {form.type === "prompt_agent" && (
                                <PromptAgentFields
                                    form={form}
                                    disabled={isSubmitting}
                                    onChange={updateAgentForm}
                                />
                            )}
                            {agent?.type === "code_agent" && onSync && (
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                            isSubmitting ||
                                            syncStatus === "syncing"
                                        }
                                        onClick={() => void handleSync()}
                                    >
                                        {syncStatus === "syncing"
                                            ? "Syncing…"
                                            : "Sync from GitHub"}
                                    </Button>
                                    {syncStatus === "synced" && (
                                        <output className="font-body text-xs font-normal leading-normal text-theme-text-muted">
                                            Synced from GitHub.
                                        </output>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="border-t border-divider pt-4">
                        <div
                            className={
                                form.type === "prompt_agent"
                                    ? "grid gap-4 md:grid-cols-2"
                                    : undefined
                            }
                        >
                            {form.type === "prompt_agent" && (
                                <PromptAgentTools
                                    form={form}
                                    disabled={isSubmitting}
                                    onChange={updateAgentForm}
                                />
                            )}
                            <div
                                className={
                                    form.type === "prompt_agent"
                                        ? "border-t border-divider pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-4"
                                        : undefined
                                }
                            >
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
                            </div>
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter className="polli:bg-transparent">
                    <Button
                        icon={<XIcon />}
                        type="button"
                        intent="neutral"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        icon={<BotIcon />}
                        type="submit"
                        intent="commit"
                        disabled={!canSubmit}
                    >
                        {isSubmitting ? "Saving…" : submitLabel}
                    </Button>
                </DialogFooter>
            </form>
        </Dialog>
    );
}
