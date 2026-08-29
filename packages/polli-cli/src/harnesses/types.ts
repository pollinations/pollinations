export interface HarnessContext {
    env: NodeJS.ProcessEnv;
    homeDir: string;
}

export interface HarnessResult {
    harness: string;
    installed: boolean;
    configured: boolean;
    changed?: boolean;
    configPath: string;
    next?: string;
}

export interface HarnessAdapter {
    id: string;
    name: string;
    description: string;
    on(context?: HarnessContext): Promise<HarnessResult>;
    off(context?: HarnessContext): Promise<HarnessResult>;
    status(context?: HarnessContext): Promise<HarnessResult>;
}
