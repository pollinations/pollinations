import { describe, expect, it } from "vitest";
import { chatToResponsesRequest } from "../../../src/text/responses/chatRequest.js";
import { pdfFileParts } from "../../../src/text/transforms/pdfFileParts.js";

const PDF = "JVBERi0xLjQK";
const DATA_URL = `data:application/pdf;base64,${PDF}`;

async function filePart(provider: string, file: Record<string, unknown>) {
    const { messages } = await pdfFileParts(
        [{ role: "user", content: [{ type: "file", file, extra: 1 }] }],
        { modelConfig: { provider } },
    );
    return (messages[0].content as unknown[])[0];
}

describe("pdfFileParts", () => {
    it.each([
        { file_data: DATA_URL },
        { file_data: PDF, mime_type: "application/pdf" },
    ])("gives Bedrock bare base64 and the PDF type (%o)", async (file) => {
        expect(await filePart("bedrock", file)).toEqual({
            type: "file",
            file: { file_data: PDF, mime_type: "application/pdf" },
            extra: 1,
        });
    });

    it.each([
        [{ file_data: DATA_URL }, "document.pdf"],
        [{ file_data: PDF, mime_type: "application/pdf" }, "document.pdf"],
        [{ file_data: DATA_URL, file_name: "a.pdf" }, "a.pdf"],
    ])("gives Azure OpenAI a data URL and a filename (%o)", async (file, name) => {
        expect(await filePart("azure-openai", file)).toEqual({
            type: "file",
            file: { file_data: DATA_URL, filename: name },
            extra: 1,
        });
    });

    it("leaves other providers and non-PDF files alone", async () => {
        for (const [provider, file] of [
            ["openrouter", { file_data: DATA_URL }],
            ["bedrock", { file_url: "https://media.pollinations.ai/a.pdf" }],
            ["bedrock", { file_data: "data:text/plain;base64,aGk=" }],
            ["bedrock", { file_data: PDF }],
        ] as const) {
            expect(await filePart(provider, file)).toMatchObject({ file });
        }
    });

    it("sends a Chat PDF to a Responses model as input_file", () => {
        const input = chatToResponsesRequest(
            [
                {
                    role: "user",
                    content: [
                        {
                            type: "file",
                            file: {
                                file_data: PDF,
                                mime_type: "application/pdf",
                            },
                        },
                    ],
                },
            ],
            { model: "gpt-6-luna" },
        ).input;
        expect(input).toEqual([
            {
                role: "user",
                content: [
                    {
                        type: "input_file",
                        file_data: DATA_URL,
                        filename: "document.pdf",
                    },
                ],
            },
        ]);
    });
});
