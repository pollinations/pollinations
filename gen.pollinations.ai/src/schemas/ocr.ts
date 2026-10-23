import { isBlockedHostname } from "@shared/community-endpoint-urls.ts";
import { z } from "zod";

// Experimental OCR API exposed at `/alpha/ocr`. The request and response
// shapes mirror Mistral's `/v1/ocr`, but they are not a stability contract —
// the alpha path may change without a version bump.

const PDF_DATA_URL_PREFIX = "data:application/pdf;base64,";

// The upstream fetches the URL itself, so only public https hosts without
// credentials are forwarded. An inline base64 PDF is passed through as-is.
function isAcceptedDocumentUrl(value: string): boolean {
    if (value.startsWith(PDF_DATA_URL_PREFIX)) {
        return value.length > PDF_DATA_URL_PREFIX.length;
    }
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !isBlockedHostname(url.hostname)
    );
}

const OcrDocumentUrlSchema = z
    .object({
        type: z.enum(["document_url"]),
        document_url: z
            .string()
            .url()
            .refine(isAcceptedDocumentUrl, {
                message:
                    "document_url must be a public https URL without credentials or a data:application/pdf;base64 URL",
            })
            .meta({
                description:
                    "Public https URL of the document to process (PDF or image), or a base64 PDF data URL (`data:application/pdf;base64,...`). The URL is fetched by the upstream, so private hosts and embedded credentials are rejected.",
                example: "https://example.com/invoice.pdf",
            }),
    })
    .meta({ description: "Document referenced by URL." });

const OcrImageUrlSchema = z
    .object({
        type: z.enum(["image_url"]),
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
                "OCR model id. Defaults to `mistralai/mistral-ocr-4.1`. Only the models served by this experimental endpoint are accepted.",
            example: "mistralai/mistral-ocr-4.1",
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
