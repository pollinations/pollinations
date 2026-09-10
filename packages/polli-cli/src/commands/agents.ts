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

type AgentBase = {
    id: string;
    name: string;
    title: string;
    description: string | null;
    visibility: "private" | "public";
    createdAt: string;
    updatedAt: string;
};

type PromptAgent = AgentBase & {
    type: "prompt_agent";
    systemPrompt: string;
    baseModel: string;
    mcpServers: string[];
};

type CodeAgent = AgentBase & {
    type: "code_agent";
    repository: string;
    deployedCommitSha: string;
};

type Agent = PromptAgent | CodeAgent;

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
    configPath: string,
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
    return {
        ...readConfig(configPath),
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
            type: agent.type,
            base_model: agent.type === "prompt_agent" ? agent.baseModel : "-",
            visibility: agent.visibility,
            pollinations_tools:
                agent.type === "prompt_agent"
                    ? agent.mcpServers.includes("pollinations")
                        ? "yes"
                        : "no"
                    : "built in",
        })),
        [
            "id",
            "name",
            "type",
            "base_model",
            "visibility",
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
    .description("Create a managed agent")
    .requiredOption(
        "--config <file>",
        "JSON agent config file sent directly to the API",
    )
    .option("--name <name>", "Prompt-agent callable model name")
    .option("--title <title>", "Prompt-agent catalog title")
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
    .requiredOption(
        "--config <file>",
        "JSON agent config file sent directly to the API",
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

const sync = new Command("sync")
    .description("Deploy the latest revision of a code agent")
    .argument("<id>", "Agent id")
    .action(async (id) => {
        try {
            const result = await gen<{
                updated: boolean;
                deployedCommitSha: string;
            }>(`/account/agents/${encodeURIComponent(id)}/sync`, {
                method: "POST",
            });
            if (getOutputMode() === "json") printResult(result);
            else {
                printSuccess(
                    result.updated
                        ? `Agent deployed at ${result.deployedCommitSha}`
                        : `Agent already uses ${result.deployedCommitSha}`,
                );
            }
        } catch (error) {
            printError(
                `Failed to sync agent: ${error instanceof Error ? error.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const agentsCommand = new Command("agents")
    .description("Manage agents")
    .addCommand(list)
    .addCommand(get)
    .addCommand(create)
    .addCommand(update)
    .addCommand(sync)
    .addCommand(remove);
