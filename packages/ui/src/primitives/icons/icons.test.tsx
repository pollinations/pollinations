import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletIcon } from "./index.tsx";

describe("icons", () => {
    it("exports a renderable svg icon from the barrel", () => {
        expect(renderToStaticMarkup(<WalletIcon />)).toContain("<svg");
    });
});
