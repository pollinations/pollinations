import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileUpload } from "./FileUpload.tsx";

const png = (name: string) => new File(["x"], name, { type: "image/png" });

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

    it("uses single-select when maxFiles is 1", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} maxFiles={1} />,
        );
        expect(html).not.toContain("multiple");
    });

    it("renders a controlled preview entry with a remove control per file", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[png("ref.png")]} onChange={() => {}} />,
        );
        expect(html).toContain("ref.png");
        expect(html).toContain('aria-label="Remove ref.png"');
    });

    it("locks fully when disabled: input disabled and remove control hidden", () => {
        const html = renderToStaticMarkup(
            <FileUpload
                value={[png("ref.png")]}
                onChange={() => {}}
                disabled
            />,
        );
        expect(html).toContain("disabled");
        expect(html).toContain("polli:cursor-not-allowed");
        // preview still shows, but the remove affordance is gone when locked
        expect(html).toContain("ref.png");
        expect(html).not.toContain('aria-label="Remove ref.png"');
    });

    it("stays interactive at the file limit so over-limit selections can be reported", () => {
        const html = renderToStaticMarkup(
            <FileUpload
                value={[png("ref.png")]}
                onChange={() => {}}
                maxFiles={1}
            />,
        );
        // at limit but not disabled -> input stays enabled (no disabled attr),
        // so over-limit drops/selects flow through partitionFiles -> onReject
        expect(html).not.toContain("disabled");
        // remove stays available so the user can get back under the limit
        expect(html).toContain('aria-label="Remove ref.png"');
    });

    it("applies a local theme override via data-theme, omitting it otherwise", () => {
        const themed = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} theme="violet" />,
        );
        expect(themed).toContain('data-theme="violet"');
        const unthemed = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} />,
        );
        expect(unthemed).not.toContain("data-theme");
    });
});
