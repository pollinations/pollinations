import { MISTRAL_OCR_4_BILLING } from "./mistral-ocr-billing";
import type { ModelDefinition } from "./registry";

export const DEFAULT_OCR_MODEL = "mistral-ocr" as const;
export type OcrModelName = keyof typeof OCR_SERVICES;

export const OCR_SERVICES = {
    "mistral-ocr": {
        aliases: ["mistral-ocr-4", "mistral-ocr-4-0"],
        provider: "mistral",
        brand: "Mistral",
        category: "text",
        addedDate: new Date("2026-07-26").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {},
        billing: MISTRAL_OCR_4_BILLING,
        title: "Mistral OCR 4",
        description:
            "Extracts structured Markdown, tables, layout blocks and confidence scores from documents and images",
        inputModalities: ["document", "image"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/ocr"],
        isSpecialized: true,
    },
} as const satisfies Record<string, ModelDefinition>;
