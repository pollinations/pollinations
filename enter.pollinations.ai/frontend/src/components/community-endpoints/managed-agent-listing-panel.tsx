import { FieldStack } from "@pollinations/ui";
import type { ManagedAgent } from "./types.ts";

export function ManagedAgentListingPanel({
    agents,
    agentId,
    isEdit,
    initialAgent,
    onChange,
}: {
    agents: ManagedAgent[];
    agentId: string;
    isEdit: boolean;
    initialAgent?: ManagedAgent;
    onChange: (agentId: string) => void;
}) {
    return (
        <FieldStack
            label="Agent"
            helper={
                isEdit
                    ? "The linked agent cannot be replaced. Edit its behavior from the model card."
                    : initialAgent
                      ? "Complete this agent by adding its model listing details."
                      : "Only agents that still need listing details are available."
            }
            alignLabelRow
        >
            <select
                name="managed-agent"
                value={agentId}
                disabled={isEdit || !!initialAgent}
                required
                className="h-10 w-full rounded-md border border-divider bg-surface px-3 text-sm text-theme-text-strong disabled:opacity-60"
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="" disabled>
                    Choose an agent
                </option>
                {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                        {agent.baseModel} — {agent.systemPrompt.slice(0, 80)}
                    </option>
                ))}
            </select>
        </FieldStack>
    );
}
