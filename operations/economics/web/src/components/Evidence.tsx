import {
    Button,
    Chip,
    Dialog,
    DialogTitle,
    InlineLink,
    Tooltip,
} from "@pollinations/ui";
import { type DriveDocumentLink, driveDocumentLink } from "../lib/documents";

export function EvidenceAction({
    evidence,
    onPreview,
    previewLabel = "Preview document",
    openDocumentLabel = "Open document",
}: {
    evidence: string;
    onPreview?: (documentLink: DriveDocumentLink) => void;
    previewLabel?: string;
    openDocumentLabel?: string;
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
            <InlineLink
                as="button"
                type="button"
                onClick={() => onPreview(documentLink)}
                external={false}
                showIcon={false}
            >
                {previewLabel}
            </InlineLink>
        );
    }

    return (
        <InlineLink href={documentLink.href} showIcon={false}>
            {documentLink.label === "Open folder"
                ? "Open folder"
                : openDocumentLabel}
        </InlineLink>
    );
}

export function EvidencePreview({
    documentLink,
    onClose,
    title = "Document preview",
}: {
    documentLink: DriveDocumentLink | null;
    onClose: () => void;
    title?: string;
}) {
    if (!documentLink?.previewHref) return null;

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            labelledBy="document-preview-title"
            size="xl"
            contentClassName="flex h-[min(90vh,64rem)] max-w-[min(94vw,72rem)] flex-col rounded-2xl border-0"
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3">
                <DialogTitle
                    id="document-preview-title"
                    className="font-subheading text-xl text-theme-text-strong"
                >
                    {title}
                </DialogTitle>
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
                    <Button type="button" size="sm" onClick={onClose} autoFocus>
                        Close
                    </Button>
                </div>
            </div>
            <iframe
                src={documentLink.previewHref}
                title={title}
                className="min-h-0 w-full flex-1 bg-surface-opaque"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            />
        </Dialog>
    );
}
