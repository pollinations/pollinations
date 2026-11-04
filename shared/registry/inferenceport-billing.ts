type InferencePortOutput = {
    usage?: { payg_credits_charged?: unknown };
    payg_usage?: { payg_credits_charged?: unknown };
    payg_credits_charged?: unknown;
    streamEvents?: InferencePortOutput[];
};

// PAYG receipts are cumulative USD totals, including rounded-to-zero charges.
export function reportedInferencePortCost(output: unknown): number | undefined {
    const value = output as InferencePortOutput | undefined;
    const events = Array.isArray(value?.streamEvents)
        ? value.streamEvents
        : value
          ? [value]
          : [];
    for (const event of [...events].reverse()) {
        const cost =
            event?.usage?.payg_credits_charged ??
            event?.payg_usage?.payg_credits_charged ??
            event?.payg_credits_charged;
        if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0)
            return cost;
    }
    return undefined;
}
