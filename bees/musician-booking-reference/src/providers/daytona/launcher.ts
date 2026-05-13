import { Daytona } from "@daytona/sdk";

export type DaytonaBeeSandboxOptions = {
    name?: string;
    repositoryUrl?: string;
    branch?: string;
    packagePath?: string;
    envVars?: Record<string, string>;
    autoStopInterval?: number;
    autoArchiveInterval?: number;
    autoDeleteInterval?: number;
};

export type DaytonaBeeSandbox = {
    id: string;
    startCommand: string;
    result?: string;
};

export async function createDaytonaBeeSandbox(
    options: DaytonaBeeSandboxOptions = {},
): Promise<DaytonaBeeSandbox> {
    const daytona = new Daytona();
    const sandbox = await daytona.create({
        language: "typescript",
        name: options.name ?? "musician-booking-reference-bee",
        envVars: {
            NODE_ENV: "production",
            PORT: "8787",
            ...options.envVars,
        },
        autoStopInterval: options.autoStopInterval ?? 15,
        autoArchiveInterval: options.autoArchiveInterval ?? 60 * 24,
        autoDeleteInterval: options.autoDeleteInterval ?? -1,
    });
    const packagePath =
        options.packagePath ?? "pollinations/bees/musician-booking-reference";
    if (options.repositoryUrl) {
        await sandbox.git.clone(
            options.repositoryUrl,
            "pollinations",
            options.branch,
        );
    }
    const startCommand = `npm install && npm run serve`;
    const response = await sandbox.process.executeCommand(
        options.repositoryUrl
            ? `npm install && npm run typecheck && npm run test`
            : "node --version && npm --version",
        options.repositoryUrl ? packagePath : undefined,
        options.envVars,
        180,
    );

    return {
        id: sandbox.id,
        startCommand,
        result: response.result,
    };
}
