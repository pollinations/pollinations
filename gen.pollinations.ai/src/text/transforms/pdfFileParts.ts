import type { ChatMessage, TransformFn } from "../types.js";

export const PDF_DATA_URL = "data:application/pdf;base64,";

type FileFields = { file_data?: unknown; mime_type?: unknown };
type FilePart = { type?: unknown; file?: FileFields };

/** Base64 bytes of a PDF sent as a data URL or as raw base64 plus mime_type. */
export function pdfBase64({
    file_data,
    mime_type,
}: FileFields): string | undefined {
    if (typeof file_data !== "string") return;
    if (file_data.startsWith(PDF_DATA_URL))
        return file_data.slice(PDF_DATA_URL.length);
    if (mime_type === "application/pdf" && !file_data.includes(":"))
        return file_data;
}

/** Whether any message carries a base64 PDF `file` part. */
export function hasPdfPart(messages: ChatMessage[]): boolean {
    return messages.some(
        ({ content }) =>
            Array.isArray(content) &&
            (content as FilePart[]).some(
                (part) =>
                    part.type === "file" &&
                    part.file !== undefined &&
                    pdfBase64(part.file) !== undefined,
            ),
    );
}

/**
 * Portkey hands a Bedrock file part's file_data to Converse as raw document
 * bytes, so a data URL fails there, and names the document with a random UUID
 * unless file_name is set, which would change the prompt on every request and
 * defeat caching.
 */
export const bedrockPdfParts: TransformFn = (messages, options) => {
    if (options.modelConfig?.provider !== "bedrock")
        return { messages, options };
    let documents = 0;
    return {
        options,
        messages: messages.map((message) =>
            Array.isArray(message.content)
                ? {
                      ...message,
                      content: (message.content as FilePart[]).map((part) => {
                          const base64 =
                              part.type === "file" &&
                              part.file &&
                              pdfBase64(part.file);
                          return base64
                              ? {
                                    ...part,
                                    file: {
                                        file_data: base64,
                                        mime_type: "application/pdf",
                                        file_name: `document-${++documents}`,
                                    },
                                }
                              : part;
                      }),
                  }
                : message,
        ),
    };
};
