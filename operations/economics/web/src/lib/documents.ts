export type DriveDocumentLink = {
    href: string;
    label: "Open document" | "Open folder";
    previewHref?: string;
};

const GOOGLE_FILE_ID = /^[A-Za-z0-9_-]+$/;
const GOOGLE_DOCUMENT_URL =
    /https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/giu;

function documentUrls(evidence: string) {
    return (evidence.match(GOOGLE_DOCUMENT_URL) ?? []).map((candidate) =>
        candidate.replace(/[),.;\]}]+$/u, ""),
    );
}

function previewUrl(
    origin: string,
    documentType: string,
    fileId: string,
    resourceKey: string | null,
) {
    if (!GOOGLE_FILE_ID.test(fileId)) return undefined;

    const preview = new URL(`/${documentType}/d/${fileId}/preview`, origin);
    if (resourceKey) preview.searchParams.set("resourcekey", resourceKey);
    return preview.toString();
}

export function driveDocumentLink(evidence: string): DriveDocumentLink | null {
    for (const href of documentUrls(evidence)) {
        const url = new URL(href);

        if (url.hostname === "drive.google.com") {
            if (url.pathname.includes("/folders/")) {
                return { href, label: "Open folder" };
            }

            const pathFileId = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1];
            const queryFileId =
                url.pathname === "/open" ? url.searchParams.get("id") : null;
            const fileId = pathFileId ?? queryFileId;
            if (fileId) {
                return {
                    href,
                    label: "Open document",
                    previewHref: previewUrl(
                        url.origin,
                        "file",
                        fileId,
                        url.searchParams.get("resourcekey"),
                    ),
                };
            }
            continue;
        }

        if (url.hostname === "docs.google.com") {
            const workspaceDocument = url.pathname.match(
                /^\/(document|spreadsheets|presentation)\/d\/([^/]+)/,
            );
            if (workspaceDocument) {
                return {
                    href,
                    label: "Open document",
                    previewHref: previewUrl(
                        url.origin,
                        workspaceDocument[1],
                        workspaceDocument[2],
                        url.searchParams.get("resourcekey"),
                    ),
                };
            }

            if (url.pathname.startsWith("/forms/")) {
                return { href, label: "Open document" };
            }
        }
    }

    return null;
}

export function hasArchivedEvidence(evidence: string): boolean {
    // A folder or a form is a location, not a retained document proving a fact.
    return driveDocumentLink(evidence)?.previewHref != null;
}

const OPEN_EVIDENCE_WORDING =
    /\b(?:missing|unresolved|awaiting|unavailable)\b|\bself-purchase checkout test\b/iu;

export function hasReconciledTransactionEvidence({
    description,
    evidence,
}: {
    description: string;
    evidence: string;
}): boolean {
    if (!hasArchivedEvidence(evidence)) return false;
    // A bank statement proves cash, not a supplier invoice. Statement-only
    // exceptions must be reviewed per fact (e.g. a payout or bank cashback),
    // not inferred globally from the vendor name.
    if (
        /\bevidence_type=payment_statement\b/u.test(evidence) &&
        !/\bevidence_requirement=payment\b/u.test(evidence)
    )
        return false;
    return !OPEN_EVIDENCE_WORDING.test(`${description} ${evidence}`);
}

export function isAcknowledgedLostTransactionEvidence({
    description,
}: {
    description: string;
}): boolean {
    return /\b(?:invoice|receipt) lost and unavailable\b|\b(?:supplier|vendor) invoice unavailable\b|\bcannot supply the historical receipt\b|\bexact supplier receipt unresolved\b/iu.test(
        description,
    );
}
