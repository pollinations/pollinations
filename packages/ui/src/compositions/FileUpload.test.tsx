import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileUpload } from "./FileUpload.tsx";

const file = new File(["audio"], "recording.mp3", { type: "audio/mpeg" });

describe("FileUpload", () => {
    it("offers another upload until the file limit is reached", () => {
        const html = renderToStaticMarkup(
            <FileUpload
                value={[file]}
                onChange={() => {}}
                maxFiles={2}
                accept="audio/*"
            />,
        );
        expect(html).toContain("Add files");
        expect(html).toContain('accept="audio/*"');
        expect(html).toContain("multiple");
        expect(html).toContain("Remove recording.mp3");
        const full = renderToStaticMarkup(
            <FileUpload value={[file]} onChange={() => {}} maxFiles={1} />,
        );
        expect(full).not.toContain('type="file"');
        expect(full).toContain("Remove recording.mp3");
    });

    it("locks both upload and removal when disabled", () => {
        const empty = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} disabled />,
        );
        expect(empty).toMatch(/<input[^>]*disabled/);
        const filled = renderToStaticMarkup(
            <FileUpload value={[file]} onChange={() => {}} disabled />,
        );
        expect(filled).not.toContain("Remove recording.mp3");
        expect(filled).not.toContain('type="file"');
        expect(filled).toContain("recording.mp3");
    });
});
