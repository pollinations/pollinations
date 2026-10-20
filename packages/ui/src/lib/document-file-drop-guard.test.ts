import { describe, expect, test, vi } from "vitest";
import { acquireDocumentFileDropGuard } from "./document-file-drop-guard.ts";

function fakeDocument() {
    return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as Document;
}

describe("document file-drop guard", () => {
    test("shares one listener pair until the final consumer releases it", () => {
        const document = fakeDocument();
        const releaseFirst = acquireDocumentFileDropGuard(document);
        const releaseSecond = acquireDocumentFileDropGuard(document);

        expect(document.addEventListener).toHaveBeenCalledTimes(2);

        releaseFirst();
        expect(document.removeEventListener).not.toHaveBeenCalled();

        releaseSecond();
        expect(document.removeEventListener).toHaveBeenCalledTimes(2);

        releaseSecond();
        expect(document.removeEventListener).toHaveBeenCalledTimes(2);
    });

    test("prevents file drops without suppressing other drag interactions", () => {
        const document = fakeDocument();
        const release = acquireDocumentFileDropGuard(document);
        const listener = vi.mocked(document.addEventListener).mock
            .calls[0]?.[1];
        const fileEvent = {
            dataTransfer: { types: ["Files"] },
            preventDefault: vi.fn(),
        } as unknown as DragEvent;
        const textEvent = {
            dataTransfer: { types: ["text/plain"] },
            preventDefault: vi.fn(),
        } as unknown as DragEvent;

        if (typeof listener !== "function") {
            throw new Error("Expected a file-drop listener");
        }

        listener(fileEvent);
        listener(textEvent);

        expect(fileEvent.preventDefault).toHaveBeenCalledOnce();
        expect(textEvent.preventDefault).not.toHaveBeenCalled();
        release();
    });
});
