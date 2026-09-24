export interface HarnessContext {
    /** Home directory harness configs are resolved against. */
    home: string;
    env: NodeJS.ProcessEnv;
}

export interface HarnessOnOptions {
    model?: string;
    browser?: boolean;
    mcp?: boolean;
    /** Run a billable smoke request after setup (opt-in). */
    smoke?: boolean;
}

export interface HarnessModel {
    id: string;
    contextWindow: number;
    /** Input modalities the model accepts, e.g. ["text", "image"]. */
    input: string[];
}

export type OffOutcome = "restored" | "stripped" | "unchanged";

export interface HarnessResult {
    harness: string;
    label: string;
    configured: boolean;
    model?: string;
    mcp?: boolean;
    files: string[];
    outcome?: OffOutcome;
    /**
     * Lifecycle state for router-backed harnesses (e.g. "awaiting-provider"),
     * shown verbatim by `polli harness <id> status`.
     */
    state?: string;
    /**
     * Process exit code the CLI should adopt (0 success, 2 refused
     * prerequisite, 3 awaiting manual steps, 4 not configured). Unset
     * means 0.
     */
    exitCode?: number;
    /** Extra human-readable lines the CLI prints after the summary. */
    notes?: string[];
}

/** One harness integration. Each adapter owns its setup strategy. */
export interface HarnessAdapter {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    on(ctx: HarnessContext, options: HarnessOnOptions): Promise<HarnessResult>;
    off(ctx: HarnessContext): Promise<HarnessResult> | HarnessResult;
    status(ctx: HarnessContext): Promise<HarnessResult> | HarnessResult;
}
