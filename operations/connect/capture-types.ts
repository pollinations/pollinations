export type PreviewCaseResult = {
    status: "pending" | "ready" | "error";
    image?: string;
    document?: string;
    error?: string;
};

export type PreviewResult = {
    revision: string;
    status: "loading" | "ready" | "error";
    stale: boolean;
    cases: Record<string, PreviewCaseResult>;
    error?: string;
};
