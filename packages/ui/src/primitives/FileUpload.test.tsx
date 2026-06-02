import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileUpload } from "./FileUpload.tsx";

describe("FileUpload", () => {
    it("renders a dropzone with a file input honoring accept and multiple", () => {
        const html = renderToStaticMarkup(
            <FileUpload
                value={[]}
                onChange={() => {}}
                accept="image/*"
                maxFiles={4}
            />,
        );
        expect(html).toContain('type="file"');
        expect(html).toContain('accept="image/*"');
        expect(html).toContain("multiple");
        expect(html).toContain("browse");
    });

    it("disables the input when disabled", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} disabled />,
        );
        expect(html).toContain("disabled");
        expect(html).toContain("polli:cursor-not-allowed");
    });

    it("renders a controlled preview entry with a remove control per file", () => {
        const file = new File(["x"], "ref.png", { type: "image/png" });
        const html = renderToStaticMarkup(
            <FileUpload value={[file]} onChange={() => {}} />,
        );
        expect(html).toContain("ref.png");
        expect(html).toContain('aria-label="Remove ref.png"');
    });

    it("uses single-select when maxFiles is 1", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} maxFiles={1} />,
        );
        expect(html).not.toContain("multiple");
    });
});
