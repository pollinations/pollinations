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
    systemPrompt: string;
    baseModel: string;
    pollinationsTools: boolean;
    mcpServers: {
        name: string;
        url: string;
        headers: Record<string, null>;
    }[];
    createdAt: string;
    updatedAt: string;
};

function readConfig(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
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
            model: agent.baseModel,
            mcp_servers: agent.mcpServers?.length ?? 0,
        })),
        ["id", "model", "mcp_servers"],
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
    .requiredOption(
        "--config <file>",
        "JSON agent config file sent directly to the API",
    )
    .action(async (opts) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>("/account/agents", {
                apiKey: key,
                method: "POST",
                body: readConfig(opts.config),
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
    .action(async (id, opts) => {
        const key = requireKey();
        try {
            const agent = await gen<Agent>(
                `/account/agents/${encodeURIComponent(id)}`,
                {
                    apiKey: key,
                    method: "PATCH",
                    body: readConfig(opts.config),
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
    .description("Manage prompt agents")
    .addCommand(list)
    .addCommand(get)
    .addCommand(create)
    .addCommand(update)
    .addCommand(remove);
