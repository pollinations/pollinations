import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletIcon } from "./index.tsx";

describe("icons", () => {
    it("renders an svg using currentColor and forwards className", () => {
        const html = renderToStaticMarkup(
            <WalletIcon className="text-amber-900" />,
        );

        expect(html).toContain("<svg");
        expect(html).toContain("currentColor");
        expect(html).toContain("text-amber-900");
    });
});
