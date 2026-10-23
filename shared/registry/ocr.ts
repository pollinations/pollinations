import type { ModelDefinition } from "./registry";

export type OcrServiceId = keyof typeof OCR_SERVICES;

export const DEFAULT_OCR_MODEL: OcrServiceId = "mistralai/mistral-ocr-4.1";

// First release is a single Mistral-backed alpha endpoint. Paddle and Baidu
// listings stay out until their upstreams and response shapes are verified.
export const OCR_SERVICES = {
    "mistralai/mistral-ocr-4.1": {
        aliases: ["ocr", "mistral-ocr"],
        provider: "mistral",
        publisher: "Mistral",
        category: "ocr",
        addedDate: new Date("2026-08-13").getTime(),
        alpha: true,
        // Mistral direct upstream: Quest Pollen does not cover it.
        paidOnly: true,
        priceMultiplier: 1,
        supportedEndpoints: ["/alpha/ocr"],
        // Mistral bills OCR 4.1 per processed page ($4 / 1000 pages), and one
        // processed page is one input image token. The returned Markdown is
        // included in that per-page price.
        cost: {
            promptImageTokens: 0.004,
        },
        title: "Mistral OCR 4.1",
        description:
            "High-accuracy document understanding. Returns structured markdown with layout and bounding boxes for embedded images.",
        inputModalities: ["image"],
        outputModalities: ["text"],
    },
} as const satisfies Record<string, ModelDefinition>;
