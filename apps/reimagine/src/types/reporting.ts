export interface BannedImage {
    id: string;
    source: "lexica" | "civitai" | "local";
    reason?: string;
    dateAdded: string;
    adminNotes?: string;
}

export interface BannedImagesResponse {
    version: string;
    lastUpdated: string;
    images: BannedImage[];
}

export interface ReportImageData {
    imageId: string;
    imageUrl: string;
    source: "lexica" | "civitai";
    prompt?: string;
    reason: string;
    userComment?: string;
    deviceInfo: {
        platform: string;
        version: string;
        timestamp: string;
    };
}

export interface ReportSubmissionData {
    name: string;
    email: string;
    message: string;
}

export interface FormCarryResponse {
    code: number;
    message: string;
    title?: string;
}

export interface ReportResult {
    success: boolean;
    message: string;
    error?: string;
}

// Raisons prédéfinies pour le signalement
export const REPORT_REASONS = [
    {
        id: "inappropriate",
        label: "Inappropriate Content",
        description: "Sexual, violent, or disturbing content",
    },
    {
        id: "copyright",
        label: "Copyright Violation",
        description: "Unauthorized use of copyrighted material",
    },
    {
        id: "hate",
        label: "Hate Speech",
        description: "Content promoting hatred or discrimination",
    },
    {
        id: "spam",
        label: "Spam or Misleading",
        description: "Spam, fake, or misleading content",
    },
    {
        id: "privacy",
        label: "Privacy Violation",
        description: "Contains private information without consent",
    },
    { id: "other", label: "Other", description: "Other policy violation" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
