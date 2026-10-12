import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { StatCard } from "./StatCard.tsx";

describe("StatCard", () => {
    test("display puts the headline number before its quiet label", () => {
        const html = renderToStaticMarkup(
            <StatCard variant="display" value="47,462" label="requests" />,
        );

        expect(html.indexOf("47,462")).toBeLessThan(html.indexOf("requests"));
        expect(html).toContain("polli:font-heading");
        expect(html).not.toContain("polli:uppercase");
    });
});
