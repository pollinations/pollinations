import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiUrlCard, apiExample } from "./ApiUrlCard";

describe("API URL card", () => {
    it("shows the endpoint without a copy button while a request is incomplete", () => {
        const html = renderToStaticMarkup(
            <ApiUrlCard
                url="https://gen.pollinations.ai/alpha/decisions"
                pendingMessage="Complete the Decide form to see a copyable API request."
            />,
        );
        expect(html).toContain("For developers");
        expect(html).toContain("https://gen.pollinations.ai/alpha/decisions");
        expect(html).not.toContain("Copy API example");
    });

    it.each(["image", "video", "audio"])(
        "copies a GET URL for %s",
        (category) => {
            const url = `https://gen.pollinations.ai/${category}/hello%20%26%20world?model=vendor%2Fmodel&voice=nova&key=YOUR_API_KEY`;
            const html = renderToStaticMarkup(<ApiUrlCard url={url} />);
            expect(apiExample(url)).toBe(url);
            expect(html).toContain("API quickstart");
            expect(html).toContain("Copy API example");
        },
    );

    it("copies a multipart transcription request", () => {
        const example = apiExample(
            "https://gen.pollinations.ai/v1/audio/transcriptions",
            {
                model: "openai/whisper-1",
                file: "YOUR_AUDIO_FILE",
                language: "en",
            },
        );
        expect(example).toContain("-F 'file=@YOUR_AUDIO_FILE'");
        expect(example).toContain("-F 'language=en'");
        expect(example).toContain("Authorization: Bearer YOUR_API_KEY");
        expect(example).not.toContain("?key=");
    });

    it("downloads separated tracks into a ZIP", () => {
        const example = apiExample(
            "https://gen.pollinations.ai/alpha/audio/stem-separation",
            { file: "clip.wav" },
        );
        expect(example).toContain("-F 'file=@clip.wav'");
        expect(example).toContain("-o stems.zip");
    });

    it("copies the nested decision question as JSON", () => {
        const fields = {
            model: "model",
            state: "Export failed",
            questions: {
                urgent: { type: "noul", instructions: "Is this urgent?" },
            },
        };
        const example = apiExample(
            "https://gen.pollinations.ai/alpha/decisions",
            fields,
        );
        expect(example).toContain(JSON.stringify(fields));
        expect(example).toContain("Content-Type: application/json");
        expect(example).not.toContain("-o ");
    });

    it("copies a JSON speech request", () => {
        const example = apiExample(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                model: "elevenlabs/eleven-v3",
                input: "I'm ready",
            },
        );
        expect(example).toContain("Content-Type: application/json");
        expect(example).toContain("input");
        expect(example).toContain("I'\\''m ready");
        expect(example).toContain("-o output.mp3");
    });

    it("uses the canonical file field for voice transforms", () => {
        const example = apiExample(
            "https://gen.pollinations.ai/v1/audio/voice-changer",
            {
                model: "elevenlabs/eleven-multilingual-sts-v2",
                file: "YOUR_AUDIO_FILE",
            },
        );
        expect(example).toContain("-F 'file=@YOUR_AUDIO_FILE'");
    });
});
