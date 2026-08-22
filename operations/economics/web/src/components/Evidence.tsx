import { Button, Chip, Tooltip, useScrollLock } from "@pollinations/ui";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { type DriveDocumentLink, driveDocumentLink } from "../lib/documents";

const LINK_CLASS =
    "font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft";

export function EvidenceAction({
    evidence,
    onPreview,
}: {
    evidence: string;
    onPreview?: (documentLink: DriveDocumentLink) => void;
}) {
    const value = evidence.trim();
    if (!value) {
        return (
            <Chip intent="warning" size="sm">
                Missing
            </Chip>
        );
    }

    const documentLink = driveDocumentLink(value);
    if (!documentLink) {
        return (
            <Tooltip triggerAs="span" content={value}>
                <span className="text-theme-text-soft underline decoration-dotted underline-offset-4">
                    Reference
                </span>
            </Tooltip>
        );
    }

    if (documentLink.previewHref && onPreview) {
        return (
            <button
                type="button"
                onClick={() => onPreview(documentLink)}
                className={LINK_CLASS}
            >
                Preview invoice
            </button>
        );
    }

    return (
        <a
            href={documentLink.href}
            target="_blank"
            rel="noreferrer noopener"
            className={LINK_CLASS}
        >
            {documentLink.label === "Open folder"
                ? "Open folder"
                : "Open invoice"}
        </a>
    );
}

export function EvidencePreview({
    documentLink,
    onClose,
}: {
    documentLink: DriveDocumentLink | null;
    onClose: () => void;
}) {
    useScrollLock(documentLink != null);

    useEffect(() => {
        if (!documentLink) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [documentLink, onClose]);

    if (!documentLink?.previewHref) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <button
                type="button"
                className="absolute inset-0 bg-black/60"
                aria-label="Close invoice preview"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="invoice-preview-title"
                className="relative flex h-[min(90vh,64rem)] w-[min(94vw,72rem)] flex-col overflow-hidden rounded-2xl bg-surface-opaque shadow-2xl"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3">
                    <h2
                        id="invoice-preview-title"
                        className="font-semibold text-theme-text-strong"
                    >
                        Invoice preview
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            as="a"
                            href={documentLink.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            intent="info"
                            size="sm"
                        >
                            Open in Drive
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={onClose}
                            autoFocus
                        >
                            Close
                        </Button>
                    </div>
                </div>
                <iframe
                    src={documentLink.previewHref}
                    title="Google Drive invoice preview"
                    className="min-h-0 w-full flex-1 bg-white"
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                />
            </div>
        </div>,
        document.body,
    );
}
