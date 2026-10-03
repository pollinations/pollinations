import { Wasmer } from "@wasmer/sdk/browser";
import { type AgentModel, buildPiConfigFiles, PI_HOME } from "./piConfig";

const WORKSPACE = "/workspace/project";
const TOOLS = "read,write,edit,bash,grep,find,ls";

export interface RunPiOptions {
    apiKey: string;
    model: string;
    models: readonly AgentModel[];
    wispUrl: string;
    prompt: string;
    onOutput: (chunk: string) => void;
    onPackageProgress?: (progress: {
        phase: string;
        download: { percent: number | null };
    }) => void;
    signal?: AbortSignal;
}

export interface RunPiResult {
    exitCode: number;
    files: Record<string, string>;
}

export async function runPi(options: RunPiOptions): Promise<RunPiResult> {
    const wasmer = new Wasmer();
    try {
        const sandbox = await wasmer.sandboxes.create({
            packages: ["wasmer/pi"],
            env: {
                HOME: PI_HOME,
                // Skip Pi's own startup network calls so the sandbox's one WISP
                // connection is reserved for the actual Pollinations request.
                PI_SKIP_VERSION_CHECK: "1",
                PI_TELEMETRY: "0",
            },
            files: {
                ...buildPiConfigFiles(
                    options.apiKey,
                    options.model,
                    options.models,
                ),
                [`${WORKSPACE}/.keep`]: "",
            },
            network: { mode: "wisp", url: options.wispUrl },
            onPackageProgress: options.onPackageProgress,
            signal: options.signal,
        });

        try {
            const proc = await sandbox
                .command("pi", ["--print", "--tools", TOOLS, options.prompt], {
                    cwd: WORKSPACE,
                })
                .spawn({ stdin: "closed", stdout: "pipe", stderr: "pipe" });

            const decoder = new TextDecoder();
            const pump = async (stream: AsyncIterable<Uint8Array> | null) => {
                if (!stream) return;
                for await (const chunk of stream) {
                    options.onOutput(decoder.decode(chunk, { stream: true }));
                }
            };
            await Promise.all([pump(proc.stdout), pump(proc.stderr)]);
            const output = await proc.wait({ check: false });

            const entries = await sandbox.fs.readDir(WORKSPACE);
            const files: Record<string, string> = {};
            for (const entry of entries) {
                if (entry.kind !== "file" || entry.name === ".keep") continue;
                files[entry.name] = await sandbox.fs.readText(
                    `${WORKSPACE}/${entry.name}`,
                );
            }

            return { exitCode: output.exitCode, files };
        } finally {
            await sandbox.close();
        }
    } finally {
        await wasmer.close();
    }
}
