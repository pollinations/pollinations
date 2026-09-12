import {
    ChatIcon,
    ImageIcon,
    SpeakerIcon,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { MODALITY_ICON } from "./model-icons.tsx";
import type { InputModality } from "./model-info.ts";

const OUTPUT_ICON = {
    text: ChatIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: SpeakerIcon,
};

export function ModelModalityBadges({
    inputs,
    outputs,
    compact = false,
}: {
    inputs: InputModality[];
    outputs?: string[];
    compact?: boolean;
}) {
    const outputModalities = (
        Object.keys(OUTPUT_ICON) as InputModality[]
    ).filter((value) => outputs?.includes(value));
    return (
        <>
            {(
                [
                    {
                        label: "Input",
                        shortLabel: "In",
                        modalities: inputs,
                        icons: MODALITY_ICON,
                    },
                    {
                        label: "Output",
                        shortLabel: "Out",
                        modalities: outputModalities,
                        icons: OUTPUT_ICON,
                    },
                ] as const
            ).map(
                ({ label, shortLabel, modalities, icons }) =>
                    modalities.length > 0 && (
                        <Tooltip
                            key={label}
                            triggerAs="span"
                            content={`${label}: ${modalities.join(", ")}`}
                            ariaLabel={`${label}: ${modalities.join(", ")}`}
                            tapEnabled
                            displayContents
                        >
                            <span
                                className={`inline-flex items-center ${compact ? "gap-1" : "gap-2"}`}
                            >
                                {outputModalities.length > 0 && (
                                    <span className="text-xs">
                                        {shortLabel}
                                    </span>
                                )}
                                {modalities.map((key) => {
                                    const Icon = icons[key];
                                    return (
                                        <Icon key={key} className="h-4 w-4" />
                                    );
                                })}
                            </span>
                        </Tooltip>
                    ),
            )}
        </>
    );
}
