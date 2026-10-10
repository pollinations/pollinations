import type { TransformFn } from "../types.js";

export const PDF_DATA_URL = "data:application/pdf;base64,";

type FileFields = {
    file_data?: unknown;
    mime_type?: unknown;
    file_name?: unknown;
};

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

// Portkey hands a Bedrock file part's file_data to Converse as raw document
// bytes, so a data URL fails there, and names the document with a random UUID
// unless file_name is set, which would change the prompt on every request and
// defeat caching. Azure OpenAI wants the data URL and reports a missing
// file_id when filename is absent.
const FILE_FIELDS: Record<
    string,
    (base64: string, file: FileFields, index: number) => Record<string, unknown>
> = {
    bedrock: (base64, _file, index) => ({
        file_data: base64,
        mime_type: "application/pdf",
        file_name: `document-${index}`,
    }),
    "azure-openai": (base64, { file_name }) => ({
        file_data: PDF_DATA_URL + base64,
        filename: typeof file_name === "string" ? file_name : "document.pdf",
    }),
};

/** Rewrites base64 PDF `file` parts into the fields the provider accepts. */
export const pdfFileParts: TransformFn = (messages, options) => {
    const fileFields = FILE_FIELDS[String(options.modelConfig?.provider)];
    if (!fileFields) return { messages, options };
    let documents = 0;
    return {
        options,
        messages: messages.map((message) =>
            Array.isArray(message.content)
                ? {
                      ...message,
                      content: message.content.map((raw) => {
                          const part = raw as Record<string, unknown> & {
                              file?: FileFields;
                          };
                          const { file } = part;
                          const base64 =
                              part.type === "file" && file && pdfBase64(file);
                          return file && base64
                              ? {
                                    ...part,
                                    file: fileFields(base64, file, ++documents),
                                }
                              : part;
                      }),
                  }
                : message,
        ),
    };
};
