import inventory from "./playground-model-overrides.json";

type PlaygroundModelOverride = {
    reason: string;
    source: string;
    supports4K?: boolean;
    imageFormats?: Record<string, string>;
    decisionQuestionTypes?: string[];
    audioTask?: string;
    audioGroup?: string;
    durationFromInput?: boolean;
    requiresImage?: boolean;
    ratios?: string[];
    defaultRatio?: string;
    soundToggleDefault?: boolean;
    exclusiveReferences?: boolean;
    maxDurationWithReference?: number;
};

const { $audioTasks, $videoFilters, ...models } = inventory;
export const videoFilters = $videoFilters;
export const audioTasks = $audioTasks;
export const audioTaskIds = Object.keys(
    audioTasks,
) as (keyof typeof audioTasks)[];

const overrides = new Map<string, PlaygroundModelOverride>(
    Object.entries(models),
);

export function playgroundModelOverride(id: string) {
    return overrides.get(id);
}
