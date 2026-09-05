import { describe, expect, it } from "vitest";
import {
    driveDocumentLink,
    hasArchivedEvidence,
    hasReconciledTransactionEvidence,
    isAcknowledgedLostTransactionEvidence,
} from "./documents";

describe("driveDocumentLink", () => {
    it("distinguishes supplier evidence from payment-only statements", () => {
        const statement =
            "evidence_type=payment_statement https://drive.google.com/file/d/statement/view";
        expect(
            hasReconciledTransactionEvidence({
                description: "Supplier payment",
                evidence: statement,
            }),
        ).toBe(false);
        expect(
            hasReconciledTransactionEvidence({
                description: "Wise cashback",
                evidence: `${statement} evidence_requirement=payment`,
            }),
        ).toBe(true);
        expect(
            hasReconciledTransactionEvidence({
                description: "Supplier payment",
                evidence:
                    "evidence_type=supplier_document https://drive.google.com/file/d/invoice/view",
            }),
        ).toBe(true);
        expect(
            hasArchivedEvidence(
                "https://drive.google.com/drive/folders/folder",
            ),
        ).toBe(false);
        expect(
            hasArchivedEvidence(
                "https://docs.google.com/forms/d/form/viewform",
            ),
        ).toBe(false);
    });
    it("recognizes Drive folders", () => {
        expect(
            driveDocumentLink(
                "https://drive.google.com/drive/u/0/folders/folder-id",
            ),
        ).toEqual({
            href: "https://drive.google.com/drive/u/0/folders/folder-id",
            label: "Open folder",
        });
    });

    it("recognizes Drive files and Google Workspace documents", () => {
        expect(
            driveDocumentLink("https://drive.google.com/file/d/file-id/view"),
        ).toEqual({
            href: "https://drive.google.com/file/d/file-id/view",
            label: "Open document",
            previewHref: "https://drive.google.com/file/d/file-id/preview",
        });
        expect(
            driveDocumentLink(
                "https://docs.google.com/spreadsheets/d/sheet-id/edit",
            ),
        ).toEqual({
            href: "https://docs.google.com/spreadsheets/d/sheet-id/edit",
            label: "Open document",
            previewHref:
                "https://docs.google.com/spreadsheets/d/sheet-id/preview",
        });
    });

    it("preserves a Drive resource key in the preview URL", () => {
        expect(
            driveDocumentLink(
                "https://drive.google.com/open?id=file-id&resourcekey=key-id",
            ),
        ).toEqual({
            href: "https://drive.google.com/open?id=file-id&resourcekey=key-id",
            label: "Open document",
            previewHref:
                "https://drive.google.com/file/d/file-id/preview?resourcekey=key-id",
        });
    });

    it("extracts a Drive link from an evidence note", () => {
        const evidence =
            "Invoice: https://drive.google.com/file/d/file-id/view?usp=drivesdk — fully covered by provider credit";

        expect(driveDocumentLink(evidence)).toEqual({
            href: "https://drive.google.com/file/d/file-id/view?usp=drivesdk",
            label: "Open document",
            previewHref: "https://drive.google.com/file/d/file-id/preview",
        });
        expect(hasArchivedEvidence(evidence)).toBe(true);
    });

    it("rejects blank, non-Drive, insecure, and deceptive links", () => {
        expect(driveDocumentLink("")).toBeNull();
        expect(driveDocumentLink("wise-statement.zip")).toBeNull();
        expect(
            driveDocumentLink("http://drive.google.com/file/d/file-id/view"),
        ).toBeNull();
        expect(
            driveDocumentLink(
                "https://drive.google.com.example.com/file/d/file-id/view",
            ),
        ).toBeNull();
    });

    it("keeps an archived but unresolved transaction open", () => {
        const evidence =
            "https://drive.google.com/file/d/exception-register/view";

        expect(
            hasReconciledTransactionEvidence({
                description: "Distinct supplier invoice unresolved",
                evidence,
            }),
        ).toBe(false);
        expect(
            hasReconciledTransactionEvidence({
                description:
                    "Supplier invoice unavailable; standing exception retained",
                evidence,
            }),
        ).toBe(false);
        expect(
            hasReconciledTransactionEvidence({
                description: "Polar self-purchase checkout test",
                evidence,
            }),
        ).toBe(false);
    });

    it("distinguishes permanent document loss from an actionable gap", () => {
        expect(
            isAcknowledgedLostTransactionEvidence({
                description:
                    "Discord · supplier invoice unavailable; standing exception retained",
            }),
        ).toBe(true);
        expect(
            isAcknowledgedLostTransactionEvidence({
                description:
                    "Pruna top-up · bank payment verified; exact supplier receipt unresolved",
            }),
        ).toBe(true);
        expect(
            isAcknowledgedLostTransactionEvidence({
                description: "Polar self-purchase checkout test",
            }),
        ).toBe(false);
    });
});
