import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceAction } from "./Evidence";

describe("EvidenceAction", () => {
    it("distinguishes missing, reference, file, and folder evidence", () => {
        expect(renderToStaticMarkup(<EvidenceAction evidence="" />)).toContain(
            "–",
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

it("offers exactly two icon actions for each retained document without visible labels", () => {
    const html = renderToStaticMarkup(
        <EvidenceAction
            evidence="https://drive.google.com/file/d/invoice-id/view"
            onPreview={() => undefined}
        />,
    );
    expect(html).toContain('aria-label="Preview document"');
    expect(html).toContain('aria-label="Download document"');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain(">Preview document<");
    expect(html).not.toContain(">Download document<");
    expect(html).toContain(
        "https://drive.google.com/uc?export=download&amp;id=invoice-id",
    );
});

it("provides a pair for each invoice and excludes the accompanying bank statement", () => {
    const html = renderToStaticMarkup(
        <EvidenceAction
            evidence="evidence_type=supplier_document; invoice=ONE https://drive.google.com/file/d/first/view; invoice=TWO https://drive.google.com/file/d/second/view; bank_payment_evidence: https://drive.google.com/file/d/statement/view"
            onPreview={() => undefined}
        />,
    );
    expect(html.match(/<svg/g)).toHaveLength(4);
    expect(html).toContain("id=first");
    expect(html).toContain("id=second");
    expect(html).not.toContain("id=statement");
});
