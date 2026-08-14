import { describe, expect, it } from "vitest";
import { driveDocumentLink } from "./documents";

describe("driveDocumentLink", () => {
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
});
