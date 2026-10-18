// Catalog prices use at most 12 decimal places. Integer arithmetic keeps
// exact budget boundaries (for example, three 0.1-Pollen images for 0.3).
const SCALE = 10n ** 12n;

function units(value) {
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,12})?$/.test(value)) {
        return null;
    }
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, "0"));
}

function decimal(value) {
    const fraction = (value % SCALE).toString().padStart(12, "0");
    return `${value / SCALE}.${fraction}`.replace(/\.?0+$/, "");
}

function imagePrice(model) {
    const price = model.pricing;
    if (
        model.agent ||
        model.category !== "image" ||
        model.flat_rate !== true ||
        price?.currency !== "pollen" ||
        model.pricing_variants?.length ||
        model.pricing_adjustments?.length ||
        Object.keys(model.pricing_units || {}).length ||
        Object.keys(price).some(
            (key) => key !== "currency" && key !== "completionImageTokens",
        )
    ) {
        return null;
    }
    // A missing rate is unknown, never evidence that a model is free.
    return units(price.completionImageTokens);
}

export function planImageBudget(models, { images, budget, questOnly, limit }) {
    const available = units(budget.toFixed(12));
    const candidates = [];
    const excluded = [];
    for (const model of models) {
        if (questOnly && model.paid_only) continue;
        const price = imagePrice(model);
        if (price === null) {
            excluded.push(model.name);
            continue;
        }
        const total = price * BigInt(images);
        candidates.push({
            model: model.name,
            pricePerImage: decimal(price),
            totalCost: decimal(total),
            withinBudget: total <= available,
            maxImages: price === 0n ? null : (available / price).toString(),
            free: price === 0n,
            paidOnly: model.paid_only === true,
            health: model.health,
        });
    }
    candidates.sort((a, b) => {
        const x = units(a.pricePerImage);
        const y = units(b.pricePerImage);
        return x < y ? -1 : x > y ? 1 : a.model.localeCompare(b.model);
    });
    return {
        currency: "pollen",
        images,
        budget: decimal(available),
        source: "https://gen.pollinations.ai/image/models",
        fetchedAt: new Date().toISOString(),
        note: "Planning only: no generation, reservation or debit. Uses current fixed per-image catalog rates; variable pricing, reference-input charges and agents are not quoted. Check model capabilities before generating. Prices and availability may change. Ranking is by price, not quality. maxImages=null means a zero listed rate, not unlimited availability. The supplied budget must be spendable by the calling key; this does not combine wallet buckets or check its balance.",
        candidates: candidates.slice(0, limit),
        totalCandidates: candidates.length,
        excluded,
    };
}
