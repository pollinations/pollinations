import assert from "node:assert/strict";

export function inferenceQuote(model, promptUpperBound, maxTokens) {
    assert.ok(
        Number.isSafeInteger(promptUpperBound) &&
            promptUpperBound >= 0 &&
            Number.isSafeInteger(maxTokens) &&
            maxTokens > 0,
        "Invalid inference token bounds",
    );
    assert.ok(
        model.pricing_adjustments === undefined ||
            (Array.isArray(model.pricing_adjustments) &&
                model.pricing_adjustments.length === 0),
        "Inference pricing adjustments cannot be bounded",
    );
    assert.ok(
        model.pricing_variants === undefined ||
            Array.isArray(model.pricing_variants),
        "Inference pricing variants invalid",
    );
    const pricing = {
        promptTextTokens: 0,
        completionTextTokens: 0,
        promptCachedTokens: 0,
        promptCacheWriteTokens: 0,
    };
    const variants = model.pricing_variants ?? [];
    // This exact public contract matches the registry's longContextAbove(272_000).
    const baseOnly =
        model.name === "openai/gpt-6.1-sol" &&
        promptUpperBound <= 272_000 &&
        variants.length === 1 &&
        variants[0]?.name === "long_context" &&
        variants[0]?.description ===
            "More than 272,000 prompt tokens; the higher rates apply to the full request.";
    // Unknown applicability stays conservative across every published schedule.
    for (const schedule of [
        model.pricing,
        ...(baseOnly ? [] : variants).map((variant) => variant?.pricing),
    ]) {
        assert.ok(
            schedule && typeof schedule === "object",
            "Inference token prices unknown",
        );
        assert.ok(
            schedule.currency === undefined || schedule.currency === "pollen",
            "Inference pricing currency invalid",
        );
        for (const [field, value] of Object.entries(schedule)) {
            if (field === "currency") continue;
            assert.ok(
                (typeof value === "number" ||
                    (typeof value === "string" && value.trim() !== "")) &&
                    Number.isFinite(Number(value)) &&
                    Number(value) >= 0,
                "Inference token prices unknown",
            );
            assert.ok(
                Object.hasOwn(pricing, field) ||
                    field === "promptImageTokens" ||
                    Number(value) === 0,
                "Inference pricing dimension cannot be bounded",
            );
        }
        for (const field of Object.keys(pricing)) {
            const value =
                schedule[field] === undefined && field.startsWith("promptCache")
                    ? schedule.promptTextTokens
                    : schedule[field];
            assert.ok(value !== undefined, "Inference token prices unknown");
            pricing[field] = Math.max(pricing[field], Number(value));
        }
    }
    assert.ok(
        pricing.promptCachedTokens <=
            Math.max(pricing.promptTextTokens, pricing.promptCacheWriteTokens),
        "Inference cache price invalid",
    );
    const reserved =
        promptUpperBound *
            Math.max(pricing.promptTextTokens, pricing.promptCacheWriteTokens) +
        maxTokens * pricing.completionTextTokens;
    assert.ok(
        Number.isFinite(reserved) && reserved > 0,
        "Inference token quote invalid",
    );
    return { pricing, reserved };
}
