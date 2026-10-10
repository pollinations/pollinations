import { afterEach, describe, expect, it } from "vitest";
import { pdfFilePartsTransform } from "../../../src/text/transforms/pdfFilePartsTransform.js";

const PDF_B64 = "JVBERi0xLjQK";
const DATA_URL = `data:application/pdf;base64,${PDF_B64}`;

function userMessage(parts: unknown[]) {
    return [{ role: "user", content: parts }];
}

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("pdfFilePartsTransform", () => {
    it("leaves non-bedrock/azure providers untouched", async () => {
        const messages = userMessage([
            { type: "file", file: { file_data: DATA_URL } },
        ]);
        const { messages: out } = await pdfFilePartsTransform(messages, {
            modelConfig: { provider: "openai" },
        });
        expect(out).toEqual(messages);
    });

    it("normalizes a PDF data URL for bedrock", async () => {
        const { messages: out } = await pdfFilePartsTransform(
            userMessage([{ type: "file", file: { file_data: DATA_URL } }]),
            { modelConfig: { provider: "bedrock" } },
        );
        expect(out[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: PDF_B64,
                    mime_type: "application/pdf",
                    file_name: "document-1",
                },
            },
        ]);
    });

    it("sanitizes an explicit bedrock filename to the Bedrock charset", async () => {
        const { messages: out } = await pdfFilePartsTransform(
            userMessage([
                {
                    type: "file",
                    file: {
                        file_data: PDF_B64,
                        mime_type: "application/pdf",
                        file_name: "lap.pdf",
                    },
                },
            ]),
            { modelConfig: { provider: "bedrock" } },
        );
        expect(out[0].content).toEqual([
            {
                type: "file",
                file: {
                    file_data: PDF_B64,
                    mime_type: "application/pdf",
                    file_name: "lap-pdf",
                },
            },
        ]);
    });

    it("assigns unique deterministic names to unnamed bedrock PDFs", async () => {
        const { messages: out } = await pdfFilePartsTransform(
            userMessage([
                { type: "file", file: { file_data: DATA_URL } },
                {
                    type: "file",
                    file: { file_data: PDF_B64, file_name: "my report v2.pdf" },
                },
                { type: "file", file: { file_data: DATA_URL } },
            ]),
            { modelConfig: { provider: "bedrock" } },
        );
        const names = (out[0].content as { file: { file_name: string } }[]).map(
            (part) => part.file.file_name,
        );
        expect(names).toEqual(["document-1", "my-report-v2-pdf", "document-3"]);
    });

    it("leaves file_id, file_url, text and image parts alone", async () => {
        const parts = [
            { type: "file", file: { file_id: "file-1" } },
            { type: "file", file: { file_url: "https://media/x.pdf" } },
            { type: "text", text: "halo" },
            {
                type: "image_url",
                image_url: { url: "data:image/png;base64,iVBOR" },
            },
        ];
        for (const provider of ["bedrock", "azure-openai"]) {
            const { messages: out } = await pdfFilePartsTransform(
                userMessage(parts),
                { modelConfig: { provider } },
            );
            expect(out[0].content).toEqual(parts);
        }
    });

    it("uploads to Azure Files and swaps in the file_id", async () => {
        let seenUrl = "";
        let seenPurpose: unknown = null;
        let seenFile: unknown = null;
        let seenKey = "";
        globalThis.fetch = (async (url: unknown, init: unknown) => {
            seenUrl = String(url);
            const form = (init as { body: FormData }).body;
            seenPurpose = form.get("purpose");
            seenFile = form.get("file");
            seenKey = (init as { headers: Record<string, string> }).headers[
                "api-key"
            ];
            return new Response(JSON.stringify({ id: "file-abc123" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const { messages: out } = await pdfFilePartsTransform(
            userMessage([{ type: "file", file: { file_data: DATA_URL } }]),
            {
                modelConfig: {
                    provider: "azure-openai",
                    "azure-resource-name": "myceli-test",
                    "azure-api-key": "key-test",
                },
            },
        );
        expect(seenUrl).toBe(
            "https://myceli-test.openai.azure.com/openai/files?api-version=2024-10-21",
        );
        expect(seenPurpose).toBe("assistants");
        expect(seenFile instanceof Blob).toBe(true);
        expect(seenKey).toBe("key-test");
        expect(out[0].content).toEqual([
            { type: "file", file: { file_id: "file-abc123" } },
        ]);
    });

    it("throws a 400 when the Azure upload fails", async () => {
        globalThis.fetch = (async () =>
            new Response("nope", { status: 500 })) as typeof fetch;
        await expect(
            pdfFilePartsTransform(
                userMessage([{ type: "file", file: { file_data: DATA_URL } }]),
                {
                    modelConfig: {
                        provider: "azure-openai",
                        "azure-resource-name": "myceli-test",
                        "azure-api-key": "key-test",
                    },
                },
            ),
        ).rejects.toMatchObject({ status: 400 });
    });
});
