export interface HarnessContext {
    /** Home directory harness configs are resolved against. */
    home: string;
    env: NodeJS.ProcessEnv;
}

export interface HarnessModel {
    id: string;
    contextWindow: number;
    /** Input modalities the model accepts, e.g. ["text", "image"]. */
    input: string[];
}

export interface HarnessSettings {
    apiKey: string;
    /** Model the harness should use by default. */
    model: string;
    /** Models to register with the harness. */
    models: HarnessModel[];
}

export interface HarnessStatus {
    /** True when Pollinations is the harness's active provider. */
    configured: boolean;
    model?: string;
}

/**
 * One coding harness integration. A profile only knows how to read and edit
 * that harness's own config files; login, key minting, backups, and the CLI
 * surface are shared by the engine so adding a harness is one file.
 */
export interface HarnessProfile {
    id: string;
    label: string;
    docsUrl: string;
    defaultModel: string;
    /** Config files `enable` may touch. Backed up before the first `on`. */
    files(ctx: HarnessContext): string[];
    /** Pollinations key already stored in the harness config, if any. */
    readKey(ctx: HarnessContext): string | null;
    enable(ctx: HarnessContext, settings: HarnessSettings): void;
    /** Strip Pollinations from the config. Used when the backup can't be restored. */
    disable(ctx: HarnessContext): void;
    status(ctx: HarnessContext): HarnessStatus;
    restartHint: string;
}
