import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "./Dialog.tsx";

describe("Dialog", () => {
    it("renders title and children when open", () => {
        const html = renderToString(
            <Dialog open title="Create key">
                <p>body</p>
            </Dialog>,
        );

        expect(html).toContain("Create key");
        expect(html).toContain("body");
    });

    it("can use the provided trigger element as the dialog trigger", () => {
        const html = renderToString(
            <Dialog
                open={false}
                triggerAsChild
                trigger={<button type="button">Open modal</button>}
            >
                <p>body</p>
            </Dialog>,
        );

        expect(html).toContain("<button");
        expect(html).toContain("Open modal");
    });
});
