import type { SourceInfo } from "./flow-environment";

export type PreviewCaseResult = {
    status: "pending" | "ready" | "error" | "reference";
    provider?: "GitHub" | "Stripe";
    image?: string;
    document?: string;
    entryRoute?: string;
    finalRoute?: string;
    error?: string;
    source?: SourceInfo;
};

export type PreviewResult = {
    source: SourceInfo;
    revision: string;
    status: "loading" | "ready" | "error";
    stale: boolean;
    queue?: { position: number; total: number };
    cases: Record<string, PreviewCaseResult>;
    error?: string;
};
