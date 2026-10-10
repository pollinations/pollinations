import { afterEach, describe, expect, it, vi } from "vitest";
import { createBedrockNativeConfig } from "../../../src/text/configs/providerConfigs.js";
import {
    fileDataTransform,
    hasChatFileParts,
    inlineChatFileData,
} from "../../../src/text/transforms/fileDataTransform.js";
import type { ChatMessage, TransformOptions } from "../../../src/text/types.js";

const PDF_B64 = btoa("%PDF-1.4 fake pdf payload");
const DATA_URL = `data:application/pdf;base64,${PDF_B64}`;

function fileMessage(part: Record<string, unknown>): ChatMessage[] {
    return [{ role: "user", content: [{ type: "file", file: part }] }];
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("hasChatFileParts", () => {
    it("finds file parts and ignores other content", () => {
        expect(hasChatFileParts(fileMessage({ file_data: DATA_URL }))).toBe(
            true,
        );
        expect(
            hasChatFileParts([
                { role: "user", content: [{ type: "text", text: "hi" }] },
                { role: "user", content: "plain" },
            ]),
        ).toBe(false);
    });
});

describe("inlineChatFileData", () => {
    it("decodes data URLs to bare base64 for Bedrock", async () => {
        const result = await inlineChatFileData(
            fileMessage({ file_data: DATA_URL }),
            "base64",
        );
        expect(result[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: PDF_B64,
                    mime_type: "application/pdf",
                },
            },
        ]);
    });

    it("keeps bare base64 and defaults the media type to PDF", async () => {
        const result = await inlineChatFileData(
            fileMessage({ file_data: PDF_B64 }),
            "base64",
        );
        expect(result[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: PDF_B64,
                    mime_type: "application/pdf",
                },
            },
        ]);
    });

    it("wraps bare base64 into a data URL for the Responses API", async () => {
        const result = await inlineChatFileData(
            fileMessage({ file_data: PDF_B64, file_name: "report.pdf" }),
            "data-url",
        );
        expect(result[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: DATA_URL,
                    mime_type: "application/pdf",
                    file_name: "report.pdf",
                },
            },
        ]);
    });

    it("downloads file_url content and inlines it", async () => {
        const pdfBytes = new Uint8Array([
            0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
        ]);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(pdfBytes, {
                status: 200,
                headers: { "content-type": "application/pdf" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await inlineChatFileData(
            fileMessage({ file_url: "https://example.com/report.pdf" }),
            "base64",
        );
        expect(fetchMock).toHaveBeenCalledWith(
            new URL("https://example.com/report.pdf"),
            expect.objectContaining({ redirect: "manual" }),
        );
        const part = (result[0].content as Record<string, unknown>[])[0]
            .file as Record<string, string>;
        expect(part.file_data).toBe(btoa("%PDF-1.4"));
        expect(part.mime_type).toBe("application/pdf");
        expect(part.file_url).toBeUndefined();
    });

    it("rejects non-PDF media types with a caller-facing error", async () => {
        await expect(
            inlineChatFileData(
                fileMessage({
                    file_data: "data:text/plain;base64,aGVsbG8=",
                }),
                "base64",
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(
                "Unsupported file type: text/plain",
            ),
        });
    });

    it("rejects file parts without inline data", async () => {
        await expect(
            inlineChatFileData(fileMessage({ file_id: "file-123" }), "base64"),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining("requires file_data or file_url"),
        });
    });

    it("leaves messages without file parts untouched", async () => {
        const messages: ChatMessage[] = [
            { role: "user", content: [{ type: "text", text: "hi" }] },
        ];
        const result = await inlineChatFileData(messages, "base64");
        expect(result).toBe(messages);
    });
});

describe("fileDataTransform", () => {
    it("normalizes file parts when the model config flags inline data", async () => {
        const options = {
            modelConfig: createBedrockNativeConfig(),
        } as unknown as TransformOptions;
        const result = await fileDataTransform(
            fileMessage({ file_data: DATA_URL }),
            options,
        );
        const part = (
            result.messages[0].content as Record<string, unknown>[]
        )[0].file as Record<string, string>;
        expect(part.file_data).toBe(PDF_B64);
        expect(part.mime_type).toBe("application/pdf");
    });

    it("passes through when the config does not require inlining", async () => {
        const messages = fileMessage({ file_data: DATA_URL });
        const result = await fileDataTransform(messages, {
            modelConfig: { provider: "azure" },
        } as unknown as TransformOptions);
        expect(result.messages).toBe(messages);
    });
});
