import {
    Alert,
    BotIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    DialogBody,
    DialogHeader,
    InlineLink,
    RefreshIcon,
    Surface,
    TabButton,
    Tooltip,
    XIcon,
} from "@pollinations/ui";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { resourceActionError } from "../../lib/resource-action-error.ts";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
import { CodeAgentFields } from "./code-agent-fields.tsx";
import { ModelFormRow } from "./model-form-row.tsx";
import { ModelListingFields } from "./model-listing-fields.tsx";
import { PromptAgentFields, PromptAgentTools } from "./prompt-agent-fields.tsx";
import { SafetyFeatureSelector } from "./safety-feature-selector.tsx";
import {
    type AgentFormState,
    agentToForm,
    type ManagedAgent,
} from "./types.ts";

export function getAgentSubmitDisabledReason({
    form,
    syncStatus,
}: {
    form: AgentFormState;
    syncStatus: string;
}): string | null {
    if (syncStatus === "syncing") {
        return "Waiting for agent sync to complete";
    }
    if (form.type === "code_agent") {
        if (form.repository.trim() === "") return "Enter a GitHub repository";
    } else {
        if (form.name.trim() === "") return "Enter an agent ID";
        if (form.title.trim() === "") return "Enter an agent title";
        if (form.systemPrompt.trim() === "") return "Enter a system prompt";
        if (form.baseModel.trim() === "") return "Select a base model";
    }
    return "Complete all required fields to save";
}

type AgentDialogProps = {
    agent?: ManagedAgent;
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (form: AgentFormState) => Promise<void>;
    /** Redeploys a code agent from GitHub and resolves to the deployed commit. */
    onSync?: () => Promise<string>;
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
    const [syncedCommitSha, setSyncedCommitSha] = useState<string | null>(null);

    useEffect(() => {
        setForm(agentToForm(open ? agent : undefined));
        setError(null);
        setIsSubmitting(false);
        setSyncStatus("idle");
        setSyncedCommitSha(null);
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
            setError(resourceActionError("save", "the agent", thrown));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleSync(): Promise<void> {
        if (!onSync) return;
        setSyncStatus("syncing");
        setError(null);
        try {
            setSyncedCommitSha(await onSync());
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
    const submitDisabledReason =
        isSubmitting || canSubmit
            ? null
            : getAgentSubmitDisabledReason({ form, syncStatus });

    const submitButton = (
        <Button
            icon={<BotIcon />}
            type="submit"
            intent="commit"
            disabled={!canSubmit}
        >
            {isSubmitting ? (agent ? "Saving…" : "Creating…") : submitLabel}
        </Button>
    );

    const actions = (
        <>
            <Button
                icon={<XIcon />}
                type="button"
                intent="neutral"
                onClick={() => onOpenChange(false)}
            >
                Cancel
            </Button>
            {submitDisabledReason ? (
                <Tooltip
                    triggerAs="span"
                    tapEnabled
                    ariaLabel={submitDisabledReason}
                    content={submitDisabledReason}
                    align="center"
                    className="inline-flex cursor-not-allowed"
                >
                    {submitButton}
                </Tooltip>
            ) : (
                submitButton
            )}
        </>
    );

    return (
        <ResourceDialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
        >
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <DialogBody actions={actions}>
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
                        <Surface>
                            <ModelFormRow
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
                            </ModelFormRow>
                        </Surface>
                    )}

                    <Surface className="space-y-3">
                        {form.type === "code_agent" && (
                            <CodeAgentFields
                                form={form}
                                disabled={isSubmitting || !!agent}
                                deployment={
                                    agent?.type === "code_agent" && onSync
                                        ? {
                                              commitSha:
                                                  syncedCommitSha ??
                                                  agent.deployedCommitSha,
                                              synced: syncStatus === "synced",
                                              sync: (
                                                  <Button
                                                      icon={<RefreshIcon />}
                                                      type="button"
                                                      intent="commit"
                                                      aria-busy={
                                                          syncStatus ===
                                                          "syncing"
                                                      }
                                                      disabled={
                                                          isSubmitting ||
                                                          syncStatus ===
                                                              "syncing"
                                                      }
                                                      title="Redeploy the latest commit from GitHub"
                                                      onClick={() =>
                                                          void handleSync()
                                                      }
                                                  >
                                                      Sync
                                                  </Button>
                                              ),
                                          }
                                        : undefined
                                }
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
                    </Surface>
                    {form.type === "prompt_agent" && (
                        <Surface>
                            <PromptAgentFields
                                form={form}
                                disabled={isSubmitting}
                                onChange={updateAgentForm}
                            />
                        </Surface>
                    )}
                    <div
                        className={
                            form.type === "prompt_agent"
                                ? "grid gap-3 md:grid-cols-2"
                                : undefined
                        }
                    >
                        {form.type === "prompt_agent" && (
                            <Surface>
                                <PromptAgentTools
                                    form={form}
                                    disabled={isSubmitting}
                                    onChange={updateAgentForm}
                                />
                            </Surface>
                        )}
                        <Surface>
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
                        </Surface>
                    </div>
                </DialogBody>
            </form>
        </ResourceDialog>
    );
}
