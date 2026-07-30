import type { BillingRules } from "./registry";

type MistralOcrOutput = {
    ocr?: {
        usage_info?: {
            pages_processed?: unknown;
        };
    };
};

export function countMistralOcrPages(output: unknown): number {
    const pages = (output as MistralOcrOutput | undefined)?.ocr?.usage_info
        ?.pages_processed;
    return typeof pages === "number" && Number.isInteger(pages) && pages > 0
        ? pages
        : 0;
}

export const MISTRAL_OCR_4_BILLING: BillingRules = {
    adjustments: [
        {
            id: "mistral.ocr_4.page.v1",
            description: "Mistral OCR 4 costs $4 per 1,000 processed pages.",
            kind: "document_ocr",
            unit: "page",
            unitCost: 4 / 1000,
            countUnits: countMistralOcrPages,
        },
    ],
};
