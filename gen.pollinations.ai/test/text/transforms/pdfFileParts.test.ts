import { describe, expect, it } from "vitest";
import { createBedrockNativeConfig } from "../../../src/text/configs/providerConfigs.js";
import { chatToResponsesRequest } from "../../../src/text/responses/chatRequest.js";
import { pdfFileParts } from "../../../src/text/transforms/pdfFileParts.js";
import type { ChatMessage } from "../../../src/text/types.js";

const PDF = "JVBERi0xLjQK";
const DATA_URL = `data:application/pdf;base64,${PDF}`;

function pdfMessages(file: Record<string, unknown>): ChatMessage[] {
    return [
        {
            role: "user",
            content: [
                { type: "text", text: "What word is in this PDF?" },
                {
                    type: "file",
                    file,
                    cache_control: { type: "ephemeral" },
                },
            ],
        },
    ];
}

function filePart(provider: string, file: Record<string, unknown>) {
    const { messages } = pdfFileParts(pdfMessages(file), {
        modelConfig: { provider },
    });
    return (messages[0].content as unknown[])[1];
}

describe("pdfFileParts", () => {
    it.each([
        { file_data: DATA_URL },
        { file_data: PDF, mime_type: "application/pdf" },
    ])("sends Bedrock raw PDF bytes Portkey maps to a document (%o)", (file) => {
        const provider = createBedrockNativeConfig().provider;
        expect(filePart(provider, file)).toEqual({
            type: "file",
            file: {
                file_data: PDF,
                mime_type: "application/pdf",
                file_name: "document-1",
            },
            cache_control: { type: "ephemeral" },
        });
    });

    it.each([
        "azure-openai",
        "openai",
    ])("gives %s a PDF data URL and the required filename", (provider) => {
        expect(
            filePart(provider, {
                file_data: PDF,
                mime_type: "application/pdf",
            }),
        ).toEqual({
            type: "file",
            file: { file_data: DATA_URL, filename: "document.pdf" },
            cache_control: { type: "ephemeral" },
        });
        expect(
            filePart(provider, { file_data: DATA_URL, file_name: "a.pdf" }),
        ).toMatchObject({ file: { file_data: DATA_URL, filename: "a.pdf" } });
    });

    it("leaves other providers, files and non-PDF data alone", () => {
        const messages = pdfMessages({ file_data: DATA_URL });
        expect(
            pdfFileParts(messages, { modelConfig: { provider: "openrouter" } })
                .messages,
        ).toBe(messages);
        for (const file of [
            { file_id: "file_1" },
            { file_url: "https://media.pollinations.ai/x" },
            { file_data: "data:text/plain;base64,aGk=" },
            { file_data: PDF },
        ]) {
            expect(filePart("bedrock", file)).toMatchObject({ file });
        }
    });

    it("forwards OpenAI PDFs on the Responses API as input_file", () => {
        const { messages } = pdfFileParts(
            pdfMessages({ file_data: PDF, mime_type: "application/pdf" }),
            {
                modelConfig: { provider: "azure-openai" },
            },
        );
        expect(
            chatToResponsesRequest(messages, { model: "gpt-5.3-codex" }).input,
        ).toEqual([
            {
                role: "user",
                content: [
                    { type: "input_text", text: "What word is in this PDF?" },
                    {
                        type: "input_file",
                        file_data: DATA_URL,
                        filename: "document.pdf",
                        prompt_cache_breakpoint: { mode: "explicit" },
                    },
                ],
            },
        ]);
    });
});
