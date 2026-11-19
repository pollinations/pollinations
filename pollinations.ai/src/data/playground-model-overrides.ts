import inventory from "./playground-model-overrides.json";

type PlaygroundModelOverride = {
    reason: string;
    source: string;
    musicAndSounds?: boolean;
    durationFromInput?: boolean;
    requiresImage?: boolean;
    ratios?: string[];
    defaultRatio?: string;
    soundToggleDefault?: boolean;
    exclusiveReferences?: boolean;
    maxDurationWithReference?: number;
};

const overrides = new Map<string, PlaygroundModelOverride>(
    Object.entries(inventory),
);

export function playgroundModelOverride(id: string) {
    return overrides.get(id);
}
