import { type ModelInfo, PollinationsError } from "@pollinations/sdk";

export const FLORET_MODEL_ID = "community/pollinations-ai/floret";

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Something went wrong. Please try again.";
}

export function isCancellation(error: unknown): boolean {
    return (
        (error instanceof PollinationsError && error.code === "CANCELLED") ||
        (error instanceof DOMException && error.name === "AbortError")
    );
}

export interface AgentChoice {
    id: string;
    title: string;
    inputModalities: string[];
}

/** Never replace an explicit choice with whichever agent happens to be first. */
export function selectedAgentChoice(
    agents: AgentChoice[],
    selectedId: string | null,
): AgentChoice | undefined {
    return agents.find((agent) => agent.id === (selectedId ?? FLORET_MODEL_ID));
}

export function agentChoices(models: ModelInfo[]): AgentChoice[] {
    return models.flatMap((model): AgentChoice[] => {
        const id = model.id ?? model.name;
        // Play talks to agents through the Responses API only.
        if (
            model.agent !== true ||
            !model.supported_endpoints?.includes("/v1/responses")
        )
            return [];
        return [
            {
                id,
                title: model.title ?? model.name,
                inputModalities: model.input_modalities ?? ["text"],
            },
        ];
    });
}
