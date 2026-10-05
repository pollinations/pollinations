import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaModelOption } from "./MediaModelOption";

describe("model dropdown option", () => {
    it.each([
        [true, "Paid Pollen required", "polli-wallet-text-paid"],
        [false, "Works with Paid or Quest Pollen", "polli-wallet-text-tier"],
    ] as const)("keeps %s access colored beside the name", (paidOnly, label, color) => {
        const html = renderToStaticMarkup(
            <MediaModelOption model={{ title: "Example model", paidOnly }} />,
        );
        expect(html).toContain(`aria-label="${label}"`);
        expect(html).toContain(color);
    });

    it("does not invent a payment type when the catalog omits it", () => {
        const html = renderToStaticMarkup(
            <MediaModelOption model={{ title: "Example model" }} />,
        );
        expect(html).toContain("Example model");
        expect(html).not.toContain("Pollen");
    });
});
