import { describe, expect, it } from "vitest";
import { normalizeBedrockFileParts } from "../../../src/text/transforms/filePartsTransform.js";
import type { ChatMessage } from "../../../src/text/types.js";

const BEDROCK_CONFIG = { provider: "bedrock" };

function fileMessage(file: Record<string, unknown>): ChatMessage[] {
    return [
        {
            role: "user",
            content: [
                { type: "file", file },
                { type: "text", text: "What does this PDF say?" },
            ],
        } as unknown as ChatMessage,
    ];
}

describe("normalizeBedrockFileParts", () => {
    it("strips the data-URL prefix and derives mime_type for Bedrock", () => {
        const { messages } = normalizeBedrockFileParts(
            fileMessage({
                file_data: "data:application/pdf;base64,JVBERi0xLjQK",
                file_name: "report.pdf",
            }),
            { modelConfig: BEDROCK_CONFIG },
        );
        const content = messages[0].content as Array<Record<string, unknown>>;
        expect(content[0]).toEqual({
            type: "file",
            file: {
                file_data: "JVBERi0xLjQK",
                file_name: "report pdf",
                mime_type: "application/pdf",
            },
        });
        expect(content[1]).toEqual({
            type: "text",
            text: "What does this PDF say?",
        });
    });

    it("keeps bare base64 payloads untouched and defaults mime_type", () => {
        const { messages } = normalizeBedrockFileParts(
            fileMessage({ file_data: "JVBERi0xLjQK" }),
            { modelConfig: BEDROCK_CONFIG },
        );
        const content = messages[0].content as Array<Record<string, unknown>>;
        expect(content[0]).toEqual({
            type: "file",
            file: {
                file_data: "JVBERi0xLjQK",
                file_name: "document-1",
                mime_type: "application/pdf",
            },
        });
    });

    it("uses deterministic positional document names for prompt caching", () => {
        const build = (): ChatMessage[] => [
            {
                role: "user",
                content: [
                    {
                        type: "file",
                        file: {
                            file_data:
                                "data:application/pdf;base64,JVBERi0xLjQK",
                        },
                    },
                    {
                        type: "file",
                        file: {
                            file_data:
                                "data:application/pdf;base64,QUJDREVGRwo=",
                        },
                    },
                ],
            } as unknown as ChatMessage,
        ];
        const first = normalizeBedrockFileParts(build(), {
            modelConfig: BEDROCK_CONFIG,
        });
        const second = normalizeBedrockFileParts(build(), {
            modelConfig: BEDROCK_CONFIG,
        });
        const content = first.messages[0].content as Array<{
            file: Record<string, unknown>;
        }>;
        expect(content[0].file.file_name).toBe("document-1");
        expect(content[1].file.file_name).toBe("document-2");
        expect(first.messages).toEqual(second.messages);
    });

    it("sanitizes file_name values Bedrock would reject", () => {
        const { messages } = normalizeBedrockFileParts(
            fileMessage({
                file_data: "JVBERi0xLjQK",
                file_name: "Q4 report (final).v2.pdf!",
            }),
            { modelConfig: BEDROCK_CONFIG },
        );
        const content = messages[0].content as Array<{
            file: Record<string, unknown>;
        }>;
        expect(content[0].file.file_name).toBe("Q4 report (final) v2 pdf");
    });

    it("is a no-op for non-Bedrock providers and missing config", () => {
        const input = fileMessage({
            file_data: "data:application/pdf;base64,JVBERi0xLjQK",
        });
        for (const options of [
            { modelConfig: { provider: "azure-openai" } },
            { modelConfig: { provider: "openrouter" } },
            {},
        ]) {
            const { messages } = normalizeBedrockFileParts(input, options);
            expect(messages).toEqual(input);
        }
    });

    it("strips parameterized data URLs and defaults the MIME type", () => {
        const { messages } = normalizeBedrockFileParts(
            fileMessage({
                file_data:
                    "data:application/pdf;charset=utf-8;base64,JVBERi0xLjQK",
            }),
            { modelConfig: BEDROCK_CONFIG },
        );
        const content = messages[0].content as Array<{
            file: Record<string, unknown>;
        }>;
        expect(content[0].file.file_data).toBe("JVBERi0xLjQK");
        expect(content[0].file.mime_type).toBe("application/pdf");
    });

    it("rejects file parts Bedrock cannot serve", () => {
        // file_url/file_id: Converse cannot fetch http(s) sources.
        expect(() =>
            normalizeBedrockFileParts(
                fileMessage({ file_url: "https://files.test/report.pdf" }),
                { modelConfig: BEDROCK_CONFIG },
            ),
        ).toThrowError(/inline base64 file_data/);
        // Malformed data URL.
        expect(() =>
            normalizeBedrockFileParts(
                fileMessage({ file_data: "data:application/pdf,JVBERi0x" }),
                { modelConfig: BEDROCK_CONFIG },
            ),
        ).toThrowError(/Malformed data URL/);
        // Non-PDF documents do not map onto the Converse format enum.
        expect(() =>
            normalizeBedrockFileParts(
                fileMessage({
                    file_data: "data:text/plain;base64,aGVsbG8K",
                }),
                { modelConfig: BEDROCK_CONFIG },
            ),
        ).toThrowError(/application\/pdf file input, not text\/plain/);
        // Converse document blocks are user-turn only.
        expect(() =>
            normalizeBedrockFileParts(
                [
                    {
                        role: "assistant",
                        content: [
                            { type: "file", file: { file_data: "JVBERi0x" } },
                        ],
                    } as unknown as ChatMessage,
                ],
                { modelConfig: BEDROCK_CONFIG },
            ),
        ).toThrowError(/only supported in user messages/);
    });

    it("leaves string content and non-file parts alone", () => {
        const input: ChatMessage[] = [
            { role: "system", content: "instructions" } as ChatMessage,
            ...fileMessage({ file_data: "JVBERi0xLjQK" }),
        ];
        const { messages } = normalizeBedrockFileParts(input, {
            modelConfig: BEDROCK_CONFIG,
        });
        expect(messages[0]).toEqual(input[0]);
        expect((messages[1].content as unknown[])[1]).toEqual({
            type: "text",
            text: "What does this PDF say?",
        });
    });
});
