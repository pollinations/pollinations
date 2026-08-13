export type DriveDocumentLink = {
    href: string;
    label: "Open document" | "Open folder";
    previewHref?: string;
};

const GOOGLE_FILE_ID = /^[A-Za-z0-9_-]+$/;

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
    const href = evidence.trim();
    if (!href) return null;

    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }

    if (url.protocol !== "https:") return null;

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
        return null;
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

    return null;
}

export function externalEvidenceUrl(evidence: string): string | null {
    const href = evidence.trim();
    if (!href) return null;

    try {
        const url = new URL(href);
        return url.protocol === "https:" || url.protocol === "http:"
            ? href
            : null;
    } catch {
        return null;
    }
}
