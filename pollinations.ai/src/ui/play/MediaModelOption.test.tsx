import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaModelOption } from "./MediaModelOption";

describe("model dropdown option", () => {
    it.each([
        [true, "Uses paid balance only", "polli-wallet-text-paid"],
        [false, "Works with any balance", "polli-wallet-text-tier"],
    ] as const)(
        "shows the %s wallet icon after the price",
        (paidOnly, label, color) => {
            const html = renderToStaticMarkup(
                <MediaModelOption
                    model={{
                        title: "Example model",
                        publisher: "Example publisher",
                        paidOnly,
                    }}
                    perDollar="8 gen/$1"
                />,
            );
            expect(html).toContain(`aria-label="${label}"`);
            expect(html).toContain(color);
            expect(html).toMatch(
                /Example model.*Example publisher.*8 gen\/\$1.*role="img"/s,
            );
        },
    );
});
