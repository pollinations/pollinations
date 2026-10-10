import { describe, expect, it } from "vitest";
import { chatToResponsesRequest } from "../../../src/text/responses/chatRequest.js";
import {
    bedrockPdfParts,
    hasPdfPart,
} from "../../../src/text/transforms/pdfFileParts.js";

const PDF = "JVBERi0xLjQK";
const DATA_URL = `data:application/pdf;base64,${PDF}`;

const chat = (file: Record<string, unknown>) => [
    { role: "user", content: [{ type: "file", file, extra: 1 }] },
];

describe("bedrockPdfParts", () => {
    it.each([
        { file_data: DATA_URL },
        { file_data: PDF, mime_type: "application/pdf" },
    ])("gives Bedrock bare base64, the PDF type and a stable name (%o)", async (file) => {
        const { messages } = await bedrockPdfParts(chat(file), {
            modelConfig: { provider: "bedrock" },
        });
        expect(messages[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: PDF,
                    mime_type: "application/pdf",
                    file_name: "document-1",
                },
                extra: 1,
            },
        ]);
    });

    it("leaves other providers and non-PDF files alone", async () => {
        for (const [provider, file] of [
            ["azure-openai", { file_data: DATA_URL }],
            ["bedrock", { file_url: "https://media.pollinations.ai/a.pdf" }],
            ["bedrock", { file_data: "data:text/plain;base64,aGk=" }],
            ["bedrock", { file_data: PDF }],
        ] as const) {
            const messages = chat(file);
            const result = await bedrockPdfParts(messages, {
                modelConfig: { provider },
            });
            expect(result.messages).toEqual(messages);
        }
    });
});

describe("PDFs on GPT models", () => {
    it("detects base64 PDF parts only", () => {
        expect(hasPdfPart(chat({ file_data: DATA_URL }))).toBe(true);
        expect(
            hasPdfPart(chat({ file_data: PDF, mime_type: "application/pdf" })),
        ).toBe(true);
        expect(hasPdfPart(chat({ file_url: "https://a.test/a.pdf" }))).toBe(
            false,
        );
        expect(hasPdfPart([{ role: "user", content: "hi" }])).toBe(false);
    });

    it("sends a Chat PDF to the Responses API as input_file", () => {
        const { input } = chatToResponsesRequest(
            chat({ file_data: PDF, mime_type: "application/pdf" }),
            { model: "gpt-5.4-nano" },
        );
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
