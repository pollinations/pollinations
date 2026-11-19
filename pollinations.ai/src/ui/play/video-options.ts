import { playgroundModelOverride } from "../../data/playground-model-overrides";

export function videoOptions(id: string, capabilities: readonly string[]) {
    const rules = playgroundModelOverride(id);
    const ratios = rules?.ratios ?? ["", "16:9", "9:16"];
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
