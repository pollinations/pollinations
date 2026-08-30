import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Callout } from "./Callout.tsx";
import { ContentHeader } from "./ContentHeader.tsx";
import { StatList } from "./StatList.tsx";

describe("content compositions", () => {
    test("renders page headers with one semantic h1", () => {
        const html = renderToStaticMarkup(
            <ContentHeader
                variant="page"
                eyebrow="Open infrastructure"
                title="Every model, one wallet."
                subtitle="Build with one API."
                action={<a href="/start">Start</a>}
            />,
        );

        expect(html).toContain("<h1");
        expect(html).toContain("Open infrastructure");
        expect(html).toContain('href="/start"');
    });

    test("keeps stat layout stable while values load", () => {
        const html = renderToStaticMarkup(
            <StatList stats={[]} placeholders={2} />,
        );

        expect(html).toContain('aria-busy="true"');
        expect(html.match(/animate-pulse/g)).toHaveLength(4);
    });

    test("applies the dark token scope to dark callouts", () => {
        const html = renderToStaticMarkup(
            <Callout title="Join" body="Build in the open" tone="dark">
                <a href="/community">Open</a>
            </Callout>,
        );

        expect(html).toContain("dark polli:bg-brand-dark");
        expect(html).toContain("Build in the open");
    });

    test("keeps themed callouts on the panel surface", () => {
        const html = renderToStaticMarkup(
            <Callout title="Build" body="Start with one API">
                <a href="/keys">Get a key</a>
            </Callout>,
        );

        expect(html).toContain("polli:bg-theme-bg-pale");
        expect(html).not.toContain("polli:bg-theme-bg-active");
    });
});
