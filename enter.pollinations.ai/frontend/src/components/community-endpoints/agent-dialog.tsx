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
import { PromptAgentFields } from "./prompt-agent-fields.tsx";
import {
    type AgentFormState,
    type AgentPayload,
    emptyAgentForm,
    isValidMcpRow,
    type ManagedAgent,
    type McpServerRow,
    toAgentPayload,
} from "./types.ts";

type AgentDialogProps = {
    agent?: ManagedAgent;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: AgentPayload) => Promise<void>;
    trigger?: ReactNode;
};

export function AgentDialog({
    agent,
    open,
    onOpenChange,
    onSubmit,
    trigger,
}: AgentDialogProps) {
    const [form, setForm] = useState<AgentFormState>(emptyAgentForm);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(
            open && agent
                ? {
                      name: agent.name,
                      systemPrompt: agent.systemPrompt,
                      baseModel: agent.baseModel,
                      mcpServers: agent.mcpServers.map((server) => ({
                          ...server,
                      })),
                  }
                : emptyAgentForm,
        );
        setError(null);
        setIsSubmitting(false);
    }, [open, agent]);

    function updateForm(
        key: keyof Omit<AgentFormState, "mcpServers">,
        value: string,
    ): void {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function updateMcpServer(
        index: number,
        key: keyof McpServerRow,
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
            mcpServers: [...current.mcpServers, { name: "", url: "" }],
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
            await onSubmit(toAgentPayload(form));
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
        form.systemPrompt.trim() !== "" &&
        form.baseModel.trim() !== "" &&
        form.mcpServers.every(isValidMcpRow);

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
                    Pollinations deploys this prompt and its MCP tools as an
                    OpenAI-compatible endpoint. Community model registration is
                    a separate step.
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
                        label="Agent name"
                        helper="An internal name; changing it does not change the endpoint URL or model listing."
                        alignLabelRow
                    >
                        <Input
                            name="agent-name"
                            value={form.name}
                            placeholder="docs-assistant"
                            maxLength={120}
                            required
                            onChange={(event) =>
                                updateForm("name", event.target.value)
                            }
                        />
                    </FieldStack>
                    <PromptAgentFields
                        form={form}
                        disabled={isSubmitting}
                        onChange={updateForm}
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
                        {isSubmitting ? "Saving…" : agent ? "Save" : "Create"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
