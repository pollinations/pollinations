import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const PDF_DATA_URL = "data:application/pdf;base64,";

type FilePart = {
    type: "file";
    file: Record<string, unknown>;
    [key: string]: unknown;
};

/** Base64 PDF bytes of a Chat `file` part: a PDF data URL or raw base64. */
function pdfBase64(part: unknown): string | undefined {
    const { type, file } = (part ?? {}) as Partial<FilePart>;
    if (type !== "file" || typeof file?.file_data !== "string") return;
    if (file.file_data.startsWith(PDF_DATA_URL)) {
        return file.file_data.slice(PDF_DATA_URL.length);
    }
    if (file.mime_type === "application/pdf" && !file.file_data.includes(":"))
        return file.file_data;
}

// Portkey maps a Bedrock file part to a Converse document block and sends
// file_data as its raw bytes; Bedrock rejects a document name with a dot.
const bedrockFile = (data: string) => ({
    file_data: data,
    mime_type: "application/pdf",
});

// OpenAI and Azure take a data URL and require filename (without it they
// report a missing file_id); they reject unknown file fields.
const openAIFile = (data: string, file: Record<string, unknown>) => ({
    file_data: `${PDF_DATA_URL}${data}`,
    filename:
        typeof file.file_name === "string" ? file.file_name : "document.pdf",
});

const FILE_SHAPES: Record<
    string,
    (data: string, file: Record<string, unknown>) => Record<string, unknown>
> = {
    bedrock: bedrockFile,
    "azure-openai": openAIFile,
    openai: openAIFile,
};

/** Rewrites base64 PDF `file` parts into the shape the provider reads. */
export function pdfFileParts(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    const shape = FILE_SHAPES[String(options.modelConfig?.provider)];
    if (!shape) return { messages, options };
    return {
        messages: messages.map((message) => {
            if (!Array.isArray(message.content)) return message;
            return {
                ...message,
                content: message.content.map((part) => {
                    const data = pdfBase64(part);
                    if (data === undefined) return part;
                    const filePart = part as FilePart;
                    return { ...filePart, file: shape(data, filePart.file) };
                }),
            };
        }),
        options,
    };
}
