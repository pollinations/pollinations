import { z } from "zod";

// Mistral-style OCR API. The request and response shapes mirror Mistral's
// `/v1/ocr` so clients can target Pollinations as a drop-in.

const OcrDocumentUrlSchema = z
    .object({
        type: z.literal("document_url"),
        document_url: z.string().url().meta({
            description:
                "URL of the document to process (PDF or image). Must be reachable by the upstream.",
            example: "https://example.com/invoice.pdf",
        }),
    })
    .meta({ description: "Document referenced by URL." });

const OcrImageUrlSchema = z
    .object({
        type: z.literal("image_url"),
        image_url: z.string().meta({
            description:
                "Base64 data URL of the image to process (e.g. `data:image/png;base64,...`).",
            example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
        }),
    })
    .meta({ description: "Document passed as an inline base64 image." });

export const OcrDocumentSchema = z
    .union([OcrDocumentUrlSchema, OcrImageUrlSchema])
    .meta({
        description:
            "The document to OCR. Either a URL (`document_url`) or an inline base64 image (`image_url`).",
    });

export const CreateOcrRequestSchema = z
    .object({
        model: z.string().optional().meta({
            description:
                "OCR model id. Defaults to `mistral-ocr`. See `/v1/models` for available models.",
            example: "mistral-ocr",
        }),
        document: OcrDocumentSchema,
        include_image_base64: z.boolean().optional().default(false).meta({
            description:
                "When true, embedded images are returned as base64 in `pages[].images[].image_base64`.",
            example: false,
        }),
        pages: z
            .array(z.number().int().min(0))
            .optional()
            .meta({
                description:
                    "Restrict processing to these 0-based page indices.",
                example: [0, 1],
            }),
    })
    .meta({ $id: "CreateOcrRequest" });

// --- Response schemas ---

const OcrDimensionsSchema = z.object({
    dpi: z.number().optional(),
    width: z.number().int(),
    height: z.number().int(),
});

const OcrImageObjectSchema = z.object({
    id: z.string(),
    top_left_x: z.number(),
    top_left_y: z.number(),
    bottom_right_x: z.number(),
    bottom_right_y: z.number(),
    image_base64: z.string().optional(),
});

const OcrPageObjectSchema = z.object({
    index: z.number().int(),
    markdown: z.string(),
    images: z.array(OcrImageObjectSchema),
    dimensions: OcrDimensionsSchema.optional(),
});

const OcrUsageInfoSchema = z.object({
    pages_processed: z.number().int(),
    doc_size_bytes: z.number().int().optional(),
});

export const CreateOcrResponseSchema = z
    .object({
        model: z.string(),
        pages: z.array(OcrPageObjectSchema),
        usage_info: OcrUsageInfoSchema,
    })
    .meta({ $id: "CreateOcrResponse" });

export type CreateOcrRequest = z.infer<typeof CreateOcrRequestSchema>;
export type OcrDocument = z.infer<typeof OcrDocumentSchema>;
export type CreateOcrResponse = z.infer<typeof CreateOcrResponseSchema>;
export type OcrPageObject = z.infer<typeof OcrPageObjectSchema>;
