import {
    playgroundModelOverride,
    videoDefaultRatios,
} from "../../data/playground-model-overrides";

export function videoOptions(id: string, capabilities: readonly string[]) {
    const rules = playgroundModelOverride(id);
    const ratios = rules?.ratios ?? videoDefaultRatios;
    const soundToggle = rules?.soundToggleDefault;
    return {
        ratios,
        defaultRatio: rules?.defaultRatio ?? ratios[0] ?? "",
        sound: !capabilities.includes("audio_output")
            ? "off"
            : soundToggle === undefined
              ? "on"
              : "optional",
        defaultSound: soundToggle ?? true,
        exclusiveReferences: rules?.exclusiveReferences ?? false,
    } as const;
}
