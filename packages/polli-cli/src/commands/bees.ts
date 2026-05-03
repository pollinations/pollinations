import { readFile, writeFile } from "node:fs/promises";
import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    assertBeeManifest,
    type BeeManifest,
    createDryRunDeployment,
    createStarterManifest,
    type RuntimeProvider,
    runtimeProviders,
    type StarterTemplate,
    starterTemplates,
    validateBeeManifest,
    withRuntimeOverride,
} from "../lib/bees.js";
import { BASE_URL } from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

async function readManifest(path: string): Promise<BeeManifest> {
    return JSON.parse(await readFile(path, "utf8")) as BeeManifest;
}

function isRuntimeProvider(value: string): value is RuntimeProvider {
    return (runtimeProviders as readonly string[]).includes(value);
}

function isStarterTemplate(value: string): value is StarterTemplate {
    return (starterTemplates as readonly string[]).includes(value);
}

function applyRuntimeOverride(
    manifest: BeeManifest,
    provider?: string,
): BeeManifest {
    if (!provider) return manifest;
    if (!isRuntimeProvider(provider)) {
        throw new Error(
            `--runtime must be one of ${runtimeProviders.join(", ")}`,
        );
    }
    return withRuntimeOverride(manifest, provider);
}

function printDeployment(deployment: Record<string, unknown>) {
    if (getOutputMode() === "json") {
        printResult(deployment);
        return;
    }

    const runtime = deployment.runtime as
        | { kind?: string; provider?: string; requestedProvider?: string }
        | undefined;
    const scopes = deployment.requiredScopes as
        | { developer?: string[]; invocation?: string[] }
        | undefined;
    const billing = deployment.billingEstimate as
        | { currency?: string; mode?: string; meters?: Array<{ name: string }> }
        | undefined;
    const surfaces = deployment.surfaces as
        | Array<{ kind: string; url: string }>
        | undefined;
    const type =
        runtime?.kind === "container"
            ? "Queen Bee (full runtime)"
            : "Worker Bee (serverless)";

    printResult({
        id: deployment.id,
        model: deployment.modelId,
        status: deployment.status,
        type,
        billing: billing
            ? `${billing.mode} ${billing.currency}; meters: ${billing.meters?.map((m) => m.name).join(", ")}`
            : undefined,
        developer_scopes: scopes?.developer?.join(", "),
        invocation_scopes: scopes?.invocation?.join(", ") || "none",
    });

    if (surfaces?.length) {
        printInfo("Projected surfaces");
        printTable(surfaces, ["kind", "url"]);
    }
}

const init = new Command("init")
    .description("Create a starter bee.json manifest")
    .argument("[path]", "Output path", "bee.json")
    .option("--name <name>", "Bee name", "my-bee")
    .option(
        "--template <template>",
        "Starter template: worker or queen",
        "worker",
    )
    .option("--queen", "Use the full-runtime Queen Bee template")
    .option("--force", "Overwrite an existing manifest")
    .action(async (path, opts) => {
        try {
            const template = opts.queen ? "queen" : opts.template;
            if (!isStarterTemplate(template)) {
                throw new Error(
                    `--template must be one of ${starterTemplates.join(", ")}`,
                );
            }
            const manifest = createStarterManifest(opts.name, template);
            await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, {
                flag: opts.force ? "w" : "wx",
            });
            printSuccess(`Created ${path}`);
            printResult({ path, name: manifest.name, template });
        } catch (err) {
            printError(
                `Failed to create manifest: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const validate = new Command("validate")
    .description("Validate a bee manifest")
    .argument("<manifest>", "Path to bee.json")
    .action(async (path) => {
        try {
            const manifest = await readManifest(path);
            const result = validateBeeManifest(manifest);
            if (!result.valid) {
                printResult(result);
                process.exit(1);
            }
            printResult({
                ...result,
                resolved: assertBeeManifest(manifest),
            });
        } catch (err) {
            printError(
                `Failed to validate bee: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const deploy = new Command("deploy")
    .description("Deploy a bee from bee.json")
    .argument("<manifest>", "Path to bee.json")
    .option("--dry-run", "Resolve deployment without calling the API")
    .option("--upgrade", "Redeploy an existing bee id")
    .option(
        "--runtime <provider>",
        "Override provider: auto, cloudflare-agents, daytona, aws-agentcore, container",
    )
    .action(async (path, opts) => {
        try {
            const rawManifest = await readManifest(path);
            const manifest = assertBeeManifest(
                applyRuntimeOverride(rawManifest, opts.runtime),
            );

            if (opts.dryRun) {
                printDeployment(createDryRunDeployment(manifest, BASE_URL));
                return;
            }

            const key = requireKey();
            const endpoint = opts.upgrade ? "/api/bees?upgrade=1" : "/api/bees";
            const deployment = await gen<Record<string, unknown>>(endpoint, {
                apiKey: key,
                method: "POST",
                body: manifest,
            });
            printDeployment(deployment);
        } catch (err) {
            printError(
                `Failed to deploy bee: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const list = new Command("list")
    .description("List deployed bees")
    .action(async () => {
        const key = requireKey();
        try {
            const deployments = await gen<Record<string, unknown>[]>(
                "/api/bees",
                { apiKey: key },
            );
            printResult(deployments);
        } catch (err) {
            printError(
                `Failed to list bees: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const status = new Command("status")
    .description("Show one bee deployment")
    .argument("<id>", "Bee deployment id")
    .action(async (id) => {
        const key = requireKey();
        try {
            const deployment = await gen<Record<string, unknown>>(
                `/api/bees/${id}`,
                { apiKey: key },
            );
            printDeployment(deployment);
        } catch (err) {
            printError(
                `Failed to fetch bee: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const events = new Command("events")
    .description("Show deployment events")
    .argument("<id>", "Bee deployment id")
    .action(async (id) => {
        const key = requireKey();
        try {
            const rows = await gen<Record<string, unknown>[]>(
                `/api/bees/${id}/events`,
                { apiKey: key },
            );
            printResult(rows);
        } catch (err) {
            printError(
                `Failed to fetch bee events: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const remove = new Command("delete")
    .description("Delete a bee deployment")
    .argument("<id>", "Bee deployment id")
    .option("--yes", "Skip confirmation")
    .action(async (id, opts) => {
        if (!opts.yes) {
            printInfo(
                `Pass ${chalk.bold("--yes")} to delete ${chalk.bold(id)}.`,
            );
            process.exit(1);
        }

        const key = requireKey();
        try {
            await gen(`/api/bees/${id}`, {
                apiKey: key,
                method: "DELETE",
            });
            printSuccess(`Deleted ${id}`);
        } catch (err) {
            printError(
                `Failed to delete bee: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const beesCommand = new Command("bees")
    .description("Deploy and manage bee agents")
    .addCommand(init)
    .addCommand(validate)
    .addCommand(deploy)
    .addCommand(list)
    .addCommand(status)
    .addCommand(events)
    .addCommand(remove);
