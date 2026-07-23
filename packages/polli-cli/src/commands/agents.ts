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

type AgentConfig = {
    systemPrompt: string;
    baseModel: string;
    mcpServers?: { name: string; url: string }[];
};

type Agent = AgentConfig & {
    id: string;
    name: string;
    baseUrl: string;
    createdAt: string;
    updatedAt: string;
};

function readConfig(path: string): AgentConfig {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as AgentConfig;
    } catch (error) {
        printError(
            `Failed to read agent config: ${error instanceof Error ? error.message : "unknown"}`,
        );
        process.exit(1);
    }
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
            model: agent.baseModel,
            mcp_servers: agent.mcpServers?.length ?? 0,
            endpoint: agent.baseUrl,
        })),
        ["id", "name", "model", "mcp_servers", "endpoint"],
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

const create = new Command("create")
    .description("Create and deploy a prompt agent")
    .requiredOption("--name <name>", "Agent name")
    .requiredOption(
        "--config <file>",
        "JSON config: { systemPrompt, baseModel, mcpServers? }",
    )
    .action(async (opts) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>("/account/agents", {
                apiKey: key,
                method: "POST",
                body: { name: opts.name, ...readConfig(opts.config) },
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
    .description("Update and redeploy an agent at the same endpoint")
    .argument("<id>", "Agent id")
    .option("--name <name>", "Agent name")
    .option(
        "--config <file>",
        "JSON config: { systemPrompt, baseModel, mcpServers? }",
    )
    .action(async (id, opts) => {
        const key = requireKey();
        if (!opts.name && !opts.config) {
            printError("Provide --name or --config");
            process.exit(1);
        }
        try {
            const agent = await gen<Agent>(
                `/account/agents/${encodeURIComponent(id)}`,
                {
                    apiKey: key,
                    method: "PATCH",
                    body: {
                        ...(opts.name ? { name: opts.name } : {}),
                        ...(opts.config ? readConfig(opts.config) : {}),
                    },
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
    .description("Delete an unregistered agent")
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
    .description("Create, edit, and delete managed agents")
    .addCommand(list)
    .addCommand(create)
    .addCommand(update)
    .addCommand(remove);
