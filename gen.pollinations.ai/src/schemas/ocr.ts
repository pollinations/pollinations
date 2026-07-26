import { z } from "zod";

const OcrDocumentUrlSchema = z
    .object({
        type: z.literal("document_url"),
        document_url: z.string().min(1).meta({
            description:
                "Public document URL or a base64-encoded document data URL.",
            example: "https://example.com/document.pdf",
        }),
    })
    .strict();

const OcrImageUrlSchema = z
    .object({
        type: z.literal("image_url"),
        image_url: z.string().min(1).meta({
            description: "Public image URL or a base64-encoded image data URL.",
            example: "https://example.com/scan.png",
        }),
    })
    .strict();

const OcrPagesSchema = z.union([
    z
        .string()
        .regex(/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/)
        .refine(
            (value) =>
                value.split(",").every((part) => {
                    const [start, end] = part.split("-").map(Number);
                    return end === undefined || start <= end;
                }),
            {
                message: "Page ranges must be in ascending order.",
            },
        )
        .meta({
            description:
                "Zero-indexed page numbers and ranges, such as `0,2-4`.",
            example: "0-2",
        }),
    z.array(z.number().int().nonnegative()).min(1),
]);

const UnsupportedAnnotationSchema = z.unknown().refine(() => false, {
    message:
        "Custom annotations are not supported because annotated pages use separate billing.",
});

export const CreateOcrRequestSchema = z
    .object({
        model: z.string().optional().meta({
            description: "OCR model name or alias.",
            example: "mistral-ocr",
        }),
        document: z.discriminatedUnion("type", [
            OcrDocumentUrlSchema,
            OcrImageUrlSchema,
        ]),
        pages: OcrPagesSchema.optional(),
        include_image_base64: z.boolean().optional(),
        image_limit: z.number().int().nonnegative().optional(),
        image_min_size: z.number().int().nonnegative().optional(),
        table_format: z.enum(["markdown", "html"]).optional(),
        extract_header: z.boolean().optional(),
        extract_footer: z.boolean().optional(),
        include_blocks: z.boolean().optional(),
        confidence_scores_granularity: z.enum(["word", "page"]).optional(),
        bbox_annotation_format: UnsupportedAnnotationSchema.optional(),
        document_annotation_format: UnsupportedAnnotationSchema.optional(),
        document_annotation_prompt: UnsupportedAnnotationSchema.optional(),
    })
    .strict()
    .meta({ $id: "CreateOcrRequest" });

const OcrUsageInfoSchema = z
    .object({
        pages_processed: z.number().int().positive(),
        doc_size_bytes: z.number().int().nonnegative().optional(),
    })
    .passthrough();

const OcrPageSchema = z
    .object({
        index: z.number().int().nonnegative(),
        markdown: z.string(),
        images: z.array(z.unknown()).optional(),
        tables: z.array(z.unknown()).optional(),
        hyperlinks: z.array(z.unknown()).optional(),
        dimensions: z.unknown().optional(),
        header: z.string().nullable().optional(),
        footer: z.string().nullable().optional(),
        blocks: z.array(z.unknown()).optional(),
        confidence_scores: z.unknown().optional(),
    })
    .passthrough();

export const CreateOcrResponseSchema = z
    .object({
        pages: z.array(OcrPageSchema).min(1),
        model: z.string(),
        document_annotation: z.unknown().nullable().optional(),
        usage_info: OcrUsageInfoSchema,
    })
    .passthrough()
    .meta({ $id: "CreateOcrResponse" });

export type CreateOcrRequest = z.infer<typeof CreateOcrRequestSchema>;
export type CreateOcrResponse = z.infer<typeof CreateOcrResponseSchema>;
