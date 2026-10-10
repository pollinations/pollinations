import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { TransformFn } from "../types.js";

const log = debug("pollinations:transforms:pdf");

const PDF_MIME = "application/pdf";
const AZURE_FILES_API_VERSION = "2024-10-21";

function pdfError(message: string, errorCode: string): never {
    throw new UpstreamError(400, { message, errorCode });
}

function splitDataUrl(data: string): { mime: string; b64: string } | null {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(data.trim());
    if (!m) return null;
    return { mime: m[1].toLowerCase(), b64: m[2].replace(/\s+/g, "") };
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function uploadPdfToAzureFiles(
    bytes: Uint8Array,
    filename: string,
    config: Record<string, unknown> | undefined,
): Promise<string> {
    const resource = config?.["azure-resource-name"];
    const apiKey = config?.["azure-api-key"] ?? config?.authKey;
    if (typeof resource !== "string" || !resource) {
        pdfError(
            "PDF input needs an Azure resource name.",
            "pdf_upload_misconfigured",
        );
    }
    if (typeof apiKey !== "string" || !apiKey) {
        pdfError(
            "PDF input needs an Azure API key.",
            "pdf_upload_misconfigured",
        );
    }
    const url = `https://${resource}.openai.azure.com/openai/files?api-version=${AZURE_FILES_API_VERSION}`;
    const form = new FormData();
    form.append("purpose", "assistants");
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    form.append("file", new Blob([buffer], { type: PDF_MIME }), filename);
    let res: Response;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "api-key": apiKey as string },
            body: form,
        });
    } catch (cause) {
        pdfError(
            `PDF upload to Azure Files failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            "pdf_upload_failed",
        );
    }
    if (!res.ok) {
        pdfError(
            `PDF upload to Azure Files failed (${res.status}).`,
            "pdf_upload_failed",
        );
    }
    const body = (await res.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) {
        pdfError(
            "PDF upload to Azure Files returned no file id.",
            "pdf_upload_failed",
        );
    }
    return body.id;
}

/** Bedrock reads PDFs from raw base64 bytes; Azure reads them via Files uploads. */
export const pdfFilePartsTransform: TransformFn = async (messages, options) => {
    const config = options?.modelConfig as Record<string, unknown> | undefined;
    const provider = config?.provider as string | undefined;
    if (provider !== "bedrock" && provider !== "azure-openai") {
        return { messages, options };
    }
    log(`Normalizing PDF file parts for ${provider}`);
    let documentIndex = 0;
    const usedDocumentNames = new Set<string>();
    // Bedrock Converse document names must be charset-safe and stable for
    // prompt caching, so user names are sanitized and missing names get
    // deterministic document-N defaults (unique within the request).
    function bedrockDocumentName(rawName: unknown): string {
        const clean =
            typeof rawName === "string"
                ? rawName
                      .replace(/[^A-Za-z0-9-_]+/g, "-")
                      .replace(/^-+|-+$/g, "")
                : "";
        documentIndex += 1;
        const base = clean || `document-${documentIndex}`;
        let name = base;
        let suffix = 1;
        while (usedDocumentNames.has(name)) {
            suffix += 1;
            name = `${base}-${suffix}`;
        }
        usedDocumentNames.add(name);
        return name;
    }
    const out = [];
    for (const message of messages) {
        if (!Array.isArray(message.content)) {
            out.push(message);
            continue;
        }
        const content: unknown[] = [];
        for (const raw of message.content) {
            const part = raw as { type?: unknown; file?: unknown };
            const file = part?.file as Record<string, unknown> | undefined;
            if (part?.type !== "file" || !file || typeof file !== "object") {
                content.push(raw);
                continue;
            }
            if (
                typeof file.file_id === "string" ||
                typeof file.file_url === "string"
            ) {
                content.push(raw);
                continue;
            }
            if (typeof file.file_data !== "string" || !file.file_data) {
                content.push(raw);
                continue;
            }
            const parsed = splitDataUrl(file.file_data);
            const mime =
                (typeof file.mime_type === "string" && file.mime_type) ||
                parsed?.mime ||
                PDF_MIME;
            if (mime !== PDF_MIME) {
                content.push(raw);
                continue;
            }
            const b64 = parsed ? parsed.b64 : file.file_data;
            if (provider === "bedrock") {
                content.push({
                    ...(raw as Record<string, unknown>),
                    file: {
                        file_data: b64,
                        mime_type: mime,
                        file_name: bedrockDocumentName(file.file_name),
                    },
                });
                continue;
            }
            const uploadName =
                (typeof file.file_name === "string" && file.file_name) ||
                "document.pdf";
            const id = await uploadPdfToAzureFiles(
                base64ToBytes(b64),
                uploadName,
                config,
            );
            log(`Uploaded PDF ${uploadName} to Azure Files`);
            content.push({
                ...(raw as Record<string, unknown>),
                file: { file_id: id },
            });
        }
        out.push({ ...message, content });
    }
    return { messages: out, options };
};
