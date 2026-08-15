import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export type OcrServiceId = keyof typeof OCR_SERVICES;

export const DEFAULT_OCR_MODEL: OcrServiceId = "mistral-ocr";

// Provider-facing model IDs (what the upstream APIs expect), keyed by registry
// model name. The registry only carries public names and pricing.
export const OCR_PROVIDER_MODEL_IDS: Record<OcrServiceId, string> = {
    "mistral-ocr": "mistral-ocr-latest",
    "paddle-ocr": "paddle-ocr",
    "baidu-unlimited-ocr": "baidu-unlimited-ocr",
};

export function getOcrProviderModelId(modelName: string): string {
    const modelId = OCR_PROVIDER_MODEL_IDS[modelName as OcrServiceId];
    if (!modelId) {
        throw new Error(
            `No provider model ID configured for OCR model: ${modelName}`,
        );
    }
    return modelId;
}

export const OCR_SERVICES = {
    "mistral-ocr": {
        aliases: ["ocr", "mistral-ocr-latest"],
        provider: "mistral",
        brand: "Mistral",
        category: "ocr",
        addedDate: new Date("2026-08-13").getTime(),
        priceMultiplier: 1,
        // Image-input-heavy, text-output-light: input is billed per processed
        // page (promptImageTokens), output markdown per completion token.
        cost: {
            promptImageTokens: perMillion(1),
            completionTextTokens: perMillion(2),
        },
        title: "Mistral OCR 4",
        description:
            "High-accuracy document understanding. Returns structured markdown with layout and bounding boxes for embedded images.",
        inputModalities: ["image"],
        outputModalities: ["text"],
    },
    "paddle-ocr": {
        aliases: ["paddleocr"],
        provider: "paddle",
        brand: "PaddleOCR",
        category: "ocr",
        addedDate: new Date("2026-08-13").getTime(),
        priceMultiplier: 1,
        cost: {
            promptImageTokens: perMillion(0.5),
            completionTextTokens: perMillion(1),
        },
        title: "PaddleOCR",
        description:
            "Lightweight OCR with strong table and text extraction across 80+ languages. Returns structured markdown with layout.",
        inputModalities: ["image"],
        outputModalities: ["text"],
    },
    "baidu-unlimited-ocr": {
        aliases: ["baidu-ocr"],
        provider: "baidu",
        brand: "Baidu",
        category: "ocr",
        addedDate: new Date("2026-08-13").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            promptImageTokens: perMillion(0.5),
            completionTextTokens: perMillion(1),
        },
        title: "Baidu Unlimited-OCR",
        description:
            "Unlimited OCR endpoint returning structured markdown with layout. Best for high-volume document extraction.",
        inputModalities: ["image"],
        outputModalities: ["text"],
    },
} as const satisfies Record<string, ModelDefinition>;
