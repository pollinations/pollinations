import inventory from "./playground-model-overrides.json";

const overrides = new Map<
    string,
    { reason: string; source: string; decisionQuestionTypes: string[] }
>(Object.entries(inventory));

export function playgroundModelOverride(id: string) {
    return overrides.get(id);
}
