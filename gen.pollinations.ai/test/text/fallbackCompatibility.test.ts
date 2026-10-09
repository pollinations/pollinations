import { describe, expect, it } from "vitest";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../../src/text/fallbackCompatibility.js";

type Definition = Parameters<typeof textCapabilityError>[0];

function definitionWith(modalities: string[]): Definition {
    return { inputModalities: modalities } as unknown as Definition;
}

function fileRequest() {
    return {
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "file",
                        file: { file_data: "JVBERi0xLjQK" },
                    },
                ],
            },
        ],
    };
}

describe("textCapabilityError - document input", () => {
    it("rejects file parts for models without the document modality", () => {
        expect(
            textCapabilityError(
                definitionWith(["text", "image"]),
                fileRequest(),
            ),
        ).toBe("This model does not support document input");
    });

    it("rejects Responses input_file items too", () => {
        const request = {
            input: [
                {
                    type: "message",
                    content: [{ type: "input_file", file_data: "QUJD" }],
                },
            ],
        };
        expect(textCapabilityError(definitionWith(["text"]), request)).toBe(
            "This model does not support document input",
        );
    });

    it("allows file parts for models with the document modality", () => {
        expect(
            textCapabilityError(
                definitionWith(["text", "image", "document"]),
                fileRequest(),
            ),
        ).toBeUndefined();
    });

    it("ignores requests without document parts", () => {
        const request = {
            messages: [
                { role: "user", content: [{ type: "text", text: "halo" }] },
            ],
        };
        expect(
            textCapabilityError(definitionWith(["text"]), request),
        ).toBeUndefined();
    });

    it("allows file_url and file_id references without the modality", () => {
        const request = {
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "file",
                            file: { file_url: "https://media/x.pdf" },
                        },
                        { type: "file", file: { file_id: "file-1" } },
                    ],
                },
            ],
        };
        expect(
            textCapabilityError(definitionWith(["text"]), request),
        ).toBeUndefined();
    });

    it("keeps fallbacks eligible only for document-capable models", () => {
        expect(
            supportsTextFallbackRequest(
                definitionWith(["text", "image"]),
                fileRequest(),
            ),
        ).toBe(false);
        expect(
            supportsTextFallbackRequest(
                definitionWith(["text", "image", "document"]),
                fileRequest(),
            ),
        ).toBe(true);
    });
});
