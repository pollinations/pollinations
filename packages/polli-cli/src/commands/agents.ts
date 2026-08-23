import { readFileSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

type Agent = {
    id: string;
    name: string;
    title: string;
    description: string | null;
    visibility: "private" | "public";
    baseUrl: string;
    upstreamModel: string;
    systemPrompt: string;
    baseModel: string;
    mcpServers: string[];
    source: {
        repositoryUrl: string;
        manifestPath: string;
        commitSha: string;
        syncedAt: string;
    } | null;
    createdAt: string;
    updatedAt: string;
};

function readConfig(path: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("config must be a JSON object");
        }
        return parsed as Record<string, unknown>;
    } catch (error) {
        printError(
            `Failed to read agent config: ${error instanceof Error ? error.message : "unknown"}`,
        );
        process.exit(1);
    }
}

export function agentBody(
    configPath: string | undefined,
    opts: Record<string, unknown>,
): Record<string, unknown> {
    if (
        opts.visibility !== undefined &&
        opts.visibility !== "private" &&
        opts.visibility !== "public"
    ) {
        printError("--visibility must be 'private' or 'public'");
        process.exit(1);
    }
    const repositoryUrl = typeof opts.repo === "string" ? opts.repo.trim() : "";
    if (!!configPath === !!repositoryUrl) {
        printError("Provide exactly one of --config or --repo");
        process.exit(1);
    }
    if (opts.visibility === "public" && !repositoryUrl) {
        printError("Public agents require --repo");
        process.exit(1);
    }
    if (repositoryUrl && opts.visibility === "private") {
        printError("--repo requires --visibility public");
        process.exit(1);
    }
    return {
        ...(repositoryUrl
            ? {
                  source: {
                      repositoryUrl,
                      manifestPath:
                          typeof opts.manifest === "string"
                              ? opts.manifest
                              : "pollinations-agent.json",
                  },
              }
            : readConfig(configPath ?? "")),
        ...(opts.name !== undefined && { name: opts.name }),
        ...(opts.title !== undefined && { title: opts.title }),
        ...(opts.description !== undefined && {
            description: opts.description,
        }),
        ...(opts.visibility !== undefined && {
            visibility: opts.visibility,
        }),
    };
}

function printAgents(agents: Agent[]): void {
    if (getOutputMode() === "json") {
        printResult(agents);
        return;
    }
    printTable(
        agents.map((agent) => ({
            id: chalk.dim(agent.id),
            name: agent.name,
            base_model: agent.baseModel,
            visibility: agent.visibility,
            source: agent.source ? "github" : "inline",
            pollinations_tools: agent.mcpServers.includes("pollinations")
                ? "yes"
                : "no",
        })),
        [
            "id",
            "name",
            "base_model",
            "visibility",
            "source",
            "pollinations_tools",
        ],
    );
}

const list = new Command("list")
    .description("List agents owned by your account")
    .action(async () => {
        const key = requireKey();
        try {
            const response = await gen<{ data: Agent[] }>("/account/agents", {
                apiKey: key,
            });
            printAgents(response.data ?? []);
        } catch (error) {
            printError(
                `Failed to list agents: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const get = new Command("get")
    .description("Get an agent owned by your account")
    .argument("<id>", "Agent id")
    .action(async (id) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>(
                `/account/agents/${encodeURIComponent(id)}`,
                { apiKey: key },
            );
            if (getOutputMode() === "json") printResult(agent);
            else printAgents([agent]);
        } catch (error) {
            printError(
                `Failed to get agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const create = new Command("create")
    .description("Create a prompt agent")
    .option("--config <file>", "JSON agent config file for a private agent")
    .option("--repo <url>", "Public GitHub repository containing the manifest")
    .option(
        "--manifest <path>",
        "Manifest path inside the repository",
        "pollinations-agent.json",
    )
    .requiredOption("--name <name>", "Callable model name")
    .requiredOption("--title <title>", "Display title shown in the catalog")
    .option("--description <text>", "Agent description", "")
    .option(
        "--visibility <visibility>",
        "Agent visibility: private (default) or public",
        "private",
    )
    .action(async (opts) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>("/account/agents", {
                apiKey: key,
                method: "POST",
                body: agentBody(opts.config, opts),
            });
            if (getOutputMode() === "json") printResult(agent);
            else {
                printSuccess(`Agent created: ${agent.id}`);
                printAgents([agent]);
            }
        } catch (error) {
            printError(
                `Failed to create agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const update = new Command("update")
    .description("Update an agent")
    .argument("<id>", "Agent id")
    .option("--config <file>", "JSON agent config file for a private agent")
    .option("--repo <url>", "Public GitHub repository containing the manifest")
    .option(
        "--manifest <path>",
        "Manifest path inside the repository",
        "pollinations-agent.json",
    )
    .option("--name <name>", "Callable model name")
    .option("--title <title>", "Display title shown in the catalog")
    .option("--description <text>", "Agent description; empty clears it")
    .option("--visibility <visibility>", "Agent visibility: private or public")
    .action(async (id, opts) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>(
                `/account/agents/${encodeURIComponent(id)}`,
                {
                    apiKey: key,
                    method: "PATCH",
                    body: agentBody(opts.config, opts),
                },
            );
            if (getOutputMode() === "json") printResult(agent);
            else {
                printSuccess(`Agent updated: ${agent.id}`);
                printAgents([agent]);
            }
        } catch (error) {
            printError(
                `Failed to update agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const sync = new Command("sync")
    .description("Sync an agent from its GitHub repository")
    .argument("<id>", "Agent id")
    .action(async (id) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>(
                `/account/agents/${encodeURIComponent(id)}/sync`,
                { apiKey: key, method: "POST" },
            );
            if (getOutputMode() === "json") printResult(agent);
            else {
                printSuccess(`Agent synced: ${agent.id}`);
                printAgents([agent]);
            }
        } catch (error) {
            printError(
                `Failed to sync agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const remove = new Command("delete")
    .description("Delete an agent and its model registration")
    .argument("<id>", "Agent id")
    .action(async (id) => {
        const key = requireKey();
        try {
            await gen<{ id: string }>(
                `/account/agents/${encodeURIComponent(id)}`,
                { apiKey: key, method: "DELETE" },
            );
            printSuccess(`Agent deleted: ${id}`);
            if (getOutputMode() === "json") printResult({ id });
        } catch (error) {
            printError(
                `Failed to delete agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const agentsCommand = new Command("agents")
    .description("Manage prompt agents")
    .addCommand(list)
    .addCommand(get)
    .addCommand(create)
    .addCommand(update)
    .addCommand(sync)
    .addCommand(remove);
