import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ModelAccessIcon } from "./ModelAccessIcon.tsx";

describe("ModelAccessIcon", () => {
    test("labels paid-only access", () => {
        const html = renderToStaticMarkup(<ModelAccessIcon paidOnly />);

        expect(html).toContain('aria-label="Paid Pollen required"');
        expect(html).toContain('title="Paid Pollen required"');
    });

    test("labels access that works with any Pollen", () => {
        const html = renderToStaticMarkup(<ModelAccessIcon />);

        expect(html).toContain('aria-label="Works with any Pollen"');
    });
});
