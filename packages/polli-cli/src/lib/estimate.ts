import { gen } from "./api.js";
import { fail, getOutputMode, printResult } from "./output.js";

// What `/image/models` reports for a model; only the fields an estimate needs.
export interface MediaModel {
    name: string;
    aliases?: string[];
    pricing?: Record<string, string>;
    pricing_units?: Record<string, { unit: string; quantity?: number }>;
    pricing_variants?: { label: string }[];
    flat_rate?: boolean;
    default_duration?: number;
}

export interface MediaRequest {
    kind: "image" | "video";
    width: number;
    height: number;
    references: number;
    duration?: number;
    audio?: boolean;
}

export interface EstimateLine {
    field: string;
    rate: number;
    quantity: number;
    unit: string;
    cost: number;
}

/** Prices one request from the model's listed rates. `total` is null when a
 * listed rate depends on usage only the provider knows (tokens, input sizes). */
export function estimateMediaCost(model: MediaModel, req: MediaRequest) {
    const pricing = model.pricing ?? {};
    const rate = (field: string) =>
        pricing[field] === undefined ? undefined : Number(pricing[field]);
    // Same per-image rule as the model catalog on enter.pollinations.ai.
    const perImage =
        req.kind === "image"
            ? (model.flat_rate ?? rate("promptTextTokens") === undefined)
            : rate("completionVideoTokens") === undefined;
    const duration = req.duration ?? model.default_duration;

    const lines: EstimateLine[] = [];
    const unpriced: string[] = [];
    for (const field of Object.keys(pricing)) {
        const price = rate(field);
        if (field === "currency" || price === undefined) continue;
        const declared = model.pricing_units?.[field];
        const add = (quantity: number, unit: string) => {
            const unitRate = price * (declared?.quantity ?? 1);
            lines.push({
                field,
                rate: unitRate,
                quantity,
                unit,
                cost: unitRate * quantity,
            });
        };

        if (field === "completionImageTokens" && declared?.unit === "megapixel")
            add((req.width * req.height) / 1_000_000, "megapixel");
        else if (field === "completionImageTokens" && perImage) add(1, "image");
        else if (field === "promptImageTokens" && req.references === 0)
            continue;
        else if (field === "promptImageTokens" && perImage && !declared)
            add(req.references, "input image");
        else if (field === "completionVideoSeconds" && duration)
            add(duration, "second");
        else if (field === "completionAudioSeconds" && duration) {
            if (req.audio) add(duration, "audio second");
        } else if (field === "promptVideoSeconds") continue;
        else unpriced.push(field);
    }

    const total =
        unpriced.length || !lines.length
            ? null
            : lines.reduce((sum, line) => sum + line.cost, 0);
    return { lines, unpriced, total };
}

const round = (n: number) => Number(n.toPrecision(4));

/** `--estimate` for `gen image` / `gen video`: reads the public model list
 * (no generation, no Pollen spent) and prints the estimate. */
export async function printEstimate(modelName: string, req: MediaRequest) {
    const models = await gen<MediaModel[]>("/image/models").catch((err) =>
        fail("Failed to fetch model pricing", err),
    );
    const model = models.find(
        (m) => m.name === modelName || m.aliases?.includes(modelName),
    );
    if (!model)
        fail(
            `Unknown ${req.kind} model: ${modelName}. Run: polli models --type ${req.kind}`,
        );
    const { lines, unpriced, total } = estimateMediaCost(
        model as MediaModel,
        req,
    );

    const notes = ["The final charge uses the usage the provider reports."];
    if (unpriced.length)
        notes.unshift(
            `Billed by usage known only after generation (${unpriced.join(", ")}).`,
        );
    if (!lines.length && !unpriced.length)
        notes.unshift("This model lists no price.");
    if (model?.pricing_variants?.length)
        notes.push(
            `Other rates apply for: ${model.pricing_variants.map((v) => v.label).join(", ")}.`,
        );

    if (getOutputMode() === "json") {
        printResult({
            model: model?.name,
            pollen: total,
            lines,
            unpriced,
            note: notes.join(" "),
        });
        return;
    }
    printResult({
        model: model?.name,
        estimate: total === null ? "unknown" : `${round(total)} pollen`,
        breakdown:
            lines
                .map(
                    (l) =>
                        `${round(l.quantity)} ${l.unit} × ${round(l.rate)} (${l.field})`,
                )
                .join(", ") || undefined,
        rates: Object.entries(model?.pricing ?? {})
            .filter(([k]) => k !== "currency")
            .map(([k, v]) => `${k}=${v}`)
            .join(" "),
        note: notes.join(" "),
    });
}
