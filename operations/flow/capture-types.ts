export type PreviewCaseResult = {
    status: "pending" | "ready" | "error" | "reference";
    provider?: "GitHub" | "Stripe";
    image?: string;
    document?: string;
    entryRoute?: string;
    finalRoute?: string;
    error?: string;
};

export type PreviewResult = {
    revision: string;
    status: "loading" | "ready" | "error";
    stale: boolean;
    queue?: { position: number; total: number };
    cases: Record<string, PreviewCaseResult>;
    error?: string;
};
