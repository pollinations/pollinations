import {
    Button,
    Dialog,
    DialogTitle,
    DownloadIcon,
    EyeIcon,
    IconButton,
    InlineLink,
    Tooltip,
} from "@pollinations/ui";
import {
    type DriveDocumentLink,
    documentDownloadLink,
    driveDocumentLink,
    supplierInvoiceLinks,
} from "../lib/documents";

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
    if (!value) return <span>–</span>;

    const invoiceLinks = supplierInvoiceLinks(value);
    if (invoiceLinks.length > 1) {
        return (
            <span className="inline-flex flex-wrap gap-2">
                {invoiceLinks.map((link, i) => (
                    <EvidenceAction
                        key={link}
                        evidence={link}
                        onPreview={onPreview}
                        previewLabel={`${previewLabel} ${i + 1}`}
                        openDocumentLabel={`invoice ${i + 1}`}
                    />
                ))}
            </span>
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

    if (!documentLink.previewHref) {
        return (
            <InlineLink href={documentLink.href} showIcon={false}>
                {documentLink.label}
            </InlineLink>
        );
    }
    const downloadHref = documentDownloadLink(documentLink);
    return (
        <span className="inline-flex items-center gap-1">
            {onPreview ? (
                <IconButton
                    variant="ghost"
                    aria-label={previewLabel}
                    onClick={() => onPreview(documentLink)}
                >
                    <EyeIcon className="h-4 w-4" />
                </IconButton>
            ) : (
                <a
                    href={documentLink.previewHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={previewLabel}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-theme-text-muted hover:text-theme-text-soft focus-visible:outline"
                >
                    <EyeIcon className="h-4 w-4" />
                </a>
            )}
            {downloadHref && (
                <a
                    href={downloadHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Download ${openDocumentLabel === "Open document" ? "document" : openDocumentLabel}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-theme-text-muted hover:text-theme-text-soft focus-visible:outline"
                >
                    <DownloadIcon className="h-4 w-4" />
                </a>
            )}
        </span>
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
            contentClassName="h-[min(90dvh,64rem)]"
        >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3">
                <DialogTitle
                    id="document-preview-title"
                    className="min-w-0 break-words font-subheading text-xl text-theme-text-strong"
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
