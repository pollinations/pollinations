import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiUrlCard } from "./ApiUrlCard";

describe("API URL card", () => {
    it.each([
        "image",
        "video",
        "audio",
    ])("preserves the encoded %s URL across colored sections", (category) => {
        const url = `https://gen.pollinations.ai/${category}/hello%20%26%20world?model=vendor%2Fmodel&voice=nova&key=YOUR_API_KEY`;
        const html = renderToStaticMarkup(<ApiUrlCard url={url} />);
        const renderedUrl = html
            .match(/<code[^>]*>(.*?)<\/code>/s)?.[1]
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&");
        expect(renderedUrl).toBe(url);
        expect(html).toContain("Copy API URL");
    });

    it("shows POST endpoints and uploaded-file fields without implying a GET request", () => {
        const html = renderToStaticMarkup(
            <ApiUrlCard
                url="https://gen.pollinations.ai/v1/audio/transcriptions"
                fields={{
                    model: "openai/whisper-1",
                    file: "YOUR_AUDIO_FILE (multipart upload)",
                    language: "en",
                }}
            />,
        );
        expect(html).toContain("/v1/audio/transcriptions");
        expect(html).toContain("POST fields");
        expect(html).toContain("multipart upload");
        expect(html).toContain("Authorization: Bearer YOUR_API_KEY");
        expect(html).not.toContain("?key=");
    });
});
