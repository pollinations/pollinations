import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "./Markdown.tsx";

describe("Markdown", () => {
    test.each([
        ["[Clip](https://example.test/result.MP4?download=1#t=2)", "video"],
        ["[Voice](https://example.test/result.wav)", "audio"],
        [
            "[Generated video](<https://media.pollinations.ai/opaque-id>)",
            "video",
        ],
        [
            "[Generated audio](<https://media.pollinations.ai/opaque-id>)",
            "audio",
        ],
    ])("plays media links inline: %s", (source, element) => {
        const html = renderToStaticMarkup(<Markdown>{source}</Markdown>);
        expect(html).toContain(`<${element} `);
        expect(html).toContain("controls=");
        expect(html).not.toContain("<a ");
    });

    test("keeps ordinary links, literal examples and unsafe URLs out of players", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {
                    "[Docs](https://example.test/docs)\n\n`[Video](https://example.test/result.mp4)`\n\n[Generated video](javascript:alert)"
                }
            </Markdown>,
        );
        expect(html).toContain('href="https://example.test/docs"');
        expect(html).toContain("<code");
        expect(html).not.toContain("<video");
        expect(html).not.toContain("javascript:");
    });

    test("renders fenced code as a labelled, copyable, wrapping panel", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {"```bash\nnpm run build -- --very-long-option\n```"}
            </Markdown>,
        );

        expect(html).toContain(">bash<");
        expect(html).toContain('aria-label="Copy code"');
        expect(html).toContain(">Copy<");
        expect(html).toContain("polli:whitespace-pre-wrap");
        expect(html).toContain("npm run build -- --very-long-option");
    });

    test("keeps inline code compact without a copy control", () => {
        const html = renderToStaticMarkup(
            <Markdown>{"Run `npm run build` locally."}</Markdown>,
        );

        expect(html).toContain("<code");
        expect(html).not.toContain('aria-label="Copy code"');
    });

    test("renders an image inline exactly where the markdown places it", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {
                    "Before\n\n![flower](https://example.test/flower.png)\n\nAfter"
                }
            </Markdown>,
        );

        expect(html).toContain('<img src="https://example.test/flower.png"');
        expect(html.indexOf("Before")).toBeLessThan(html.indexOf("flower.png"));
        expect(html.indexOf("flower.png")).toBeLessThan(html.indexOf("After"));
    });

    test("renders a video file inline as a playable video, not an image", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {"![Generated clip](https://example.test/result.mp4)"}
            </Markdown>,
        );

        expect(html).toContain('<video src="https://example.test/result.mp4"');
        expect(html).toContain("controls=");
        expect(html).not.toContain("<img");
    });

    test("renders an audio file inline as a playable audio element", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {"![Generated voice](https://example.test/result.mp3)"}
            </Markdown>,
        );

        expect(html).toContain('<audio src="https://example.test/result.mp3"');
        expect(html).not.toContain("<img");
    });
});
