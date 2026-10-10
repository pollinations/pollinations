export type MediaModelMetadata = {
    resolutions: string[];
    minDuration?: number;
    maxDuration?: number;
    defaultDuration?: number;
    allowedDurations: number[];
    durationStep?: number;
    maxReferenceImages?: number;
    videoCapabilities: string[];
};

/** Missing metadata is unknown, never a guessed fixed value or size preset. */
export function mediaModelSettings(
    model: MediaModelMetadata | undefined,
    selected: { resolution?: string; duration?: number } = {},
) {
    const resolutions = model?.resolutions ?? [];
    const resolution =
        resolutions.find((value) => value === selected.resolution) ??
        resolutions[0];
    const options = [...(model?.allowedDurations ?? [])].sort((a, b) => a - b);
    const min = options.length ? options[0] : model?.minDuration;
    const max = options.length
        ? options[options.length - 1]
        : model?.maxDuration;
    // The API accepts integer seconds; a model may declare a coarser step.
    const step = model?.durationStep ?? 1;
    if (min === undefined || max === undefined || max < min)
        return { resolution, duration: undefined };

    const allowed = (value: number | undefined): value is number =>
        value !== undefined &&
        (options.length
            ? options.includes(value)
            : value >= min && value <= max && (value - min) % step === 0);
    const fallback = allowed(model?.defaultDuration)
        ? model.defaultDuration
        : min;
    const value = allowed(selected.duration) ? selected.duration : fallback;
    return { resolution, duration: { min, max, options, step, value } };
}
