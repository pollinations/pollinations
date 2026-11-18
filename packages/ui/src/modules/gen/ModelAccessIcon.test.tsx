import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ModelAccessIcon } from "./ModelAccessIcon.tsx";

describe("ModelAccessIcon", () => {
    test("labels paid-only access", () => {
        const html = renderToStaticMarkup(<ModelAccessIcon paidOnly />);

        expect(html).toContain('aria-label="Uses paid balance only"');
        expect(html).toContain('title="Uses paid balance only"');
    });

    test("labels access that works with any balance", () => {
        const html = renderToStaticMarkup(<ModelAccessIcon />);

        expect(html).toContain('aria-label="Works with any balance"');
    });
});
