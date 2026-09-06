import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceAction } from "./Evidence";

describe("EvidenceAction", () => {
    it("distinguishes missing, reference, file, and folder evidence", () => {
        expect(renderToStaticMarkup(<EvidenceAction evidence="" />)).toContain(
            "Missing",
        );
        expect(
            renderToStaticMarkup(
                <EvidenceAction evidence="Discord receipt in billing history" />,
            ),
        ).toContain("Reference");
        expect(
            renderToStaticMarkup(
                <EvidenceAction
                    evidence="https://drive.google.com/file/d/invoice-id/view"
                    onPreview={() => undefined}
                />,
            ),
        ).toContain("Preview document");
        expect(
            renderToStaticMarkup(
                <EvidenceAction evidence="https://drive.google.com/drive/folders/month-folder" />,
            ),
        ).toContain("Open folder");
    });

    it("supports provider-source labels without changing document defaults", () => {
        expect(
            renderToStaticMarkup(
                <EvidenceAction
                    evidence="https://drive.google.com/file/d/source-id/view"
                    onPreview={() => undefined}
                    previewLabel="Provider source"
                    openDocumentLabel="Provider source"
                />,
            ),
        ).toContain("Provider source");
    });
});
