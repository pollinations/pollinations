import { z } from "zod";

export const PollenSchema = z.enum(["quest", "all"]).meta({
    description:
        "Model eligibility for an agent run. quest excludes models requiring purchased Pollen; all (default) permits both. pollen and X-Pollinations-Pollen are header aliases and must agree when both are supplied. A signed Quest restriction cannot be widened. This does not select which wallet balance is debited.",
});

export const POLLEN_HEADER = "x-pollinations-pollen";
export const POLLEN_SHORT_HEADER = "pollen";

export const PollenHeadersSchema = z
    .object({
        [POLLEN_HEADER]: PollenSchema.optional(),
        [POLLEN_SHORT_HEADER]: PollenSchema.optional(),
    })
    .refine(
        (headers) =>
            headers[POLLEN_HEADER] === undefined ||
            headers[POLLEN_SHORT_HEADER] === undefined ||
            headers[POLLEN_HEADER] === headers[POLLEN_SHORT_HEADER],
        { message: "pollen and X-Pollinations-Pollen must agree" },
    );
