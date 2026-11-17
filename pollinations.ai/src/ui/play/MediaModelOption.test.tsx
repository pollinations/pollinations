import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaModelOption } from "./MediaModelOption";

describe("model dropdown option", () => {
    it.each([
        [true, "Uses paid balance only", "polli-wallet-text-paid"],
        [false, "Works with any balance", "polli-wallet-text-tier"],
    ] as const)(
        "keeps %s access colored beside the name",
        (paidOnly, label, color) => {
            const html = renderToStaticMarkup(
                <MediaModelOption
                    model={{ title: "Example model", paidOnly }}
                />,
            );
            expect(html).toContain(`aria-label="${label}"`);
            expect(html).toContain(color);
        },
    );
});
