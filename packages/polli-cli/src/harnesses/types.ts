export interface HarnessContext {
    /** Home directory harness configs are resolved against. */
    home: string;
    env: NodeJS.ProcessEnv;
}

export interface HarnessOnOptions {
    model?: string;
    browser?: boolean;
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
    files: string[];
    outcome?: OffOutcome;
}

/** One harness integration. Each adapter owns its setup strategy. */
export interface HarnessAdapter {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    on(
        ctx: HarnessContext,
        options: HarnessOnOptions,
    ): Promise<HarnessResult>;
    off(ctx: HarnessContext): Promise<HarnessResult> | HarnessResult;
    status(ctx: HarnessContext): Promise<HarnessResult> | HarnessResult;
}
