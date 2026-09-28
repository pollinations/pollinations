import {
    ClockIcon,
    ExpandIcon,
    ImageIcon,
    SpeakerIcon,
} from "@pollinations/ui";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import type { ReactNode } from "react";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";

export function MediaFact({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <span
            role="img"
            aria-label={label}
            className="inline-flex items-center gap-1 text-xs tabular-nums text-theme-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
        >
            {children}
        </span>
    );
}

/** Compact comparison facts from discovery, not an inferred feature list. */
export function MediaModelDetails({ model }: { model: MediaModelMetadata }) {
    const { duration } = mediaModelSettings(model);
    const sound = model.videoCapabilities.includes("audio_output");
    if (
        !model.resolutions.length &&
        !duration &&
        !model.maxReferenceImages &&
        !sound
    )
        return null;
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {model.resolutions.length > 0 && (
                <MediaFact
                    label={`Resolutions: ${model.resolutions.join(", ")}`}
                >
                    <ExpandIcon aria-hidden="true" />
                    <span aria-hidden="true">
                        {model.resolutions.join(" / ").toUpperCase()}
                    </span>
                </MediaFact>
            )}
            {duration && (
                <MediaFact
                    label={
                        duration.options.length > 1
                            ? `Durations: ${duration.options.join(", ")} seconds`
                            : duration.min === duration.max
                              ? `Fixed duration: ${duration.min} seconds`
                              : `Duration: ${duration.min} to ${duration.max} seconds`
                    }
                >
                    <ClockIcon aria-hidden="true" />
                    <span aria-hidden="true">
                        {duration.min === duration.max
                            ? duration.min
                            : `${duration.min}–${duration.max}`}
                        s
                    </span>
                </MediaFact>
            )}
            {!!model.maxReferenceImages && (
                <MediaFact
                    label={`Up to ${model.maxReferenceImages} reference images`}
                >
                    <ImageIcon aria-hidden="true" />
                    <span aria-hidden="true">≤{model.maxReferenceImages}</span>
                </MediaFact>
            )}
            {sound && (
                <MediaFact label="Supports generated audio">
                    <SpeakerIcon aria-hidden="true" />
                </MediaFact>
            )}
        </span>
    );
}

export function MediaModelOption({
    model,
}: {
    model: MediaModelMetadata & { title: string; paidOnly?: boolean };
}) {
    return (
        <span className="flex w-full min-w-0 flex-col items-start gap-x-4 gap-y-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                <span className="truncate">{model.title}</span>
                {model.paidOnly !== undefined && (
                    <span
                        role="img"
                        aria-label={
                            model.paidOnly
                                ? "Paid Pollen required"
                                : "Works with Paid or Quest Pollen"
                        }
                        className="inline-flex shrink-0"
                    >
                        <WalletKindIcon
                            kind={model.paidOnly ? "paid" : "tier"}
                        />
                    </span>
                )}
            </span>
            <MediaModelDetails model={model} />
        </span>
    );
}
