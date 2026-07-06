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

const PRICE_FLAGS = [
    ["--prompt-text-price <number>", "Prompt text token price"],
    ["--prompt-cached-price <number>", "Prompt cached token price"],
    ["--prompt-cache-write-price <number>", "Prompt cache write token price"],
    ["--prompt-audio-price <number>", "Prompt audio token price"],
    ["--prompt-image-price <number>", "Prompt image token price"],
    ["--completion-text-price <number>", "Completion text token price"],
    [
        "--completion-reasoning-price <number>",
        "Completion reasoning token price",
    ],
    ["--completion-audio-price <number>", "Completion audio token price"],
] as const;

const PRICE_OPTION_KEYS = [
    "promptTextPrice",
    "promptCachedPrice",
    "promptCacheWritePrice",
    "promptAudioPrice",
    "promptImagePrice",
    "completionTextPrice",
    "completionReasoningPrice",
    "completionAudioPrice",
] as const;

type PriceOptionKey = (typeof PRICE_OPTION_KEYS)[number];

const CAPABILITY_FLAG_KEYS = ["tools", "search", "reasoning"] as const;

interface MyModel {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    kind?: string;
    createdAt: string;
    updatedAt: string;
    [key: string]: unknown;
}

function addPriceOptions(command: Command): Command {
    for (const [flag, description] of PRICE_FLAGS) {
        command.option(flag, description);
    }
    return command;
}

function addCapabilityOptions(command: Command): Command {
    return command
        .option("--kind <kind>", "Endpoint kind: model or agent")
        .option(
            "--max-request-price <number>",
            "Max Pollen billed per request (caller protection cap)",
        )
        .option("--tools", "Declare tool-calling support")
        .option("--no-tools", "Clear tool-calling support")
        .option("--search", "Declare web-search support")
        .option("--no-search", "Clear web-search support")
        .option("--reasoning", "Declare reasoning support")
        .option("--no-reasoning", "Clear reasoning support");
}

function readPriceOptions(opts: Record<string, unknown>) {
    const prices: Partial<Record<PriceOptionKey, number>> = {};
    for (const key of PRICE_OPTION_KEYS) {
        if (opts[key] === undefined) continue;
        const value = Number(opts[key]);
        if (!Number.isFinite(value) || value < 0) {
            printError(
                `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a non-negative number`,
            );
            process.exit(1);
        }
        prices[key] = value;
    }
    return prices;
}

function modelBody(opts: Record<string, unknown>, includeRequired: boolean) {
    const body: Record<string, unknown> = {
        ...readPriceOptions(opts),
    };
    const fields = [
        ["name", "name"],
        ["description", "description"],
        ["baseUrl", "baseUrl"],
        ["upstreamModel", "upstreamModel"],
        ["bearerToken", "bearerToken"],
    ] as const;

    for (const [optionKey, bodyKey] of fields) {
        if (opts[optionKey] !== undefined) body[bodyKey] = opts[optionKey];
    }

    if (opts.kind !== undefined) {
        if (opts.kind !== "model" && opts.kind !== "agent") {
            printError("--kind must be 'model' or 'agent'");
            process.exit(1);
        }
        body.kind = opts.kind;
    }
    for (const flag of CAPABILITY_FLAG_KEYS) {
        if (opts[flag] !== undefined) body[flag] = opts[flag];
    }
    if (opts.maxRequestPrice !== undefined) {
        const value = Number(opts.maxRequestPrice);
        if (!Number.isFinite(value) || value <= 0) {
            printError("--max-request-price must be a positive number");
            process.exit(1);
        }
        body.maxRequestPrice = value;
    }

    if (includeRequired) {
        for (const required of ["name", "baseUrl", "bearerToken"]) {
            if (!body[required]) {
                printError(
                    `--${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`,
                );
                process.exit(1);
            }
        }
    }

    return body;
}

function printModels(models: MyModel[]) {
    if (getOutputMode() === "json") {
        printResult(models);
        return;
    }
    printTable(
        models.map((model) => ({
            id: chalk.dim(model.id),
            model: chalk.hex("#a78bfa").bold(model.modelId),
            kind: model.kind ?? "model",
            upstream: model.upstreamModel,
            base_url: model.baseUrl,
            description: model.description ?? "-",
        })),
        ["id", "model", "kind", "upstream", "base_url", "description"],
    );
}

const list = new Command("list")
    .description("List models owned by your account")
    .action(async () => {
        const key = requireKey();
        try {
            const res = await gen<{ data: MyModel[] }>("/account/my-models", {
                apiKey: key,
            });
            printModels(res.data ?? []);
        } catch (err) {
            printError(
                `Failed to list my models: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const create = addPriceOptions(
    addCapabilityOptions(
        new Command("create")
            .description("Register an OpenAI-compatible model endpoint")
            .requiredOption("--name <name>", "Model name")
            .option("--description <text>", "Model description")
            .requiredOption("--base-url <url>", "OpenAI-compatible base URL")
            .option("--upstream-model <model>", "Upstream model id")
            .requiredOption("--bearer-token <token>", "Upstream bearer token"),
    ),
).action(async (opts) => {
    const key = requireKey();
    try {
        const created = await gen<MyModel>("/account/my-models", {
            apiKey: key,
            method: "POST",
            body: modelBody(opts, true),
        });
        if (getOutputMode() === "json") printResult(created);
        else {
            printSuccess(`Model registered: ${created.modelId}`);
            printModels([created]);
        }
    } catch (err) {
        printError(
            `Failed to create model: ${err instanceof Error ? err.message : "unknown"}`,
        );
        process.exit(1);
    }
});

const update = addPriceOptions(
    addCapabilityOptions(
        new Command("update")
            .description("Update one of your models")
            .argument("<id>", "Model id")
            .option("--name <name>", "Model name")
            .option("--description <text>", "Model description")
            .option("--base-url <url>", "OpenAI-compatible base URL")
            .option("--upstream-model <model>", "Upstream model id")
            .option("--bearer-token <token>", "Upstream bearer token"),
    ),
).action(async (id, opts) => {
    const key = requireKey();
    try {
        const updated = await gen<MyModel>(
            `/account/my-models/${encodeURIComponent(id)}/update`,
            {
                apiKey: key,
                method: "POST",
                body: modelBody(opts, false),
            },
        );
        if (getOutputMode() === "json") printResult(updated);
        else {
            printSuccess(`Model updated: ${updated.modelId}`);
            printModels([updated]);
        }
    } catch (err) {
        printError(
            `Failed to update model: ${err instanceof Error ? err.message : "unknown"}`,
        );
        process.exit(1);
    }
});

const remove = new Command("delete")
    .description("Delete one of your models")
    .argument("<id>", "Model id")
    .action(async (id) => {
        const key = requireKey();
        try {
            await gen<{ id: string }>(
                `/account/my-models/${encodeURIComponent(id)}`,
                {
                    apiKey: key,
                    method: "DELETE",
                },
            );
            printSuccess(`Model deleted: ${id}`);
            if (getOutputMode() === "json") printResult({ id });
        } catch (err) {
            printError(
                `Failed to delete model: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const models = new Command("models")
    .description("List upstream models from an endpoint before registering it")
    .requiredOption("--base-url <url>", "OpenAI-compatible base URL")
    .requiredOption("--bearer-token <token>", "Upstream bearer token")
    .action(async (opts) => {
        const key = requireKey();
        try {
            const res = await gen<{ data: unknown[] }>(
                "/account/my-models/models",
                {
                    apiKey: key,
                    method: "POST",
                    body: {
                        baseUrl: opts.baseUrl,
                        bearerToken: opts.bearerToken,
                    },
                },
            );
            const modelIds = res.data ?? [];
            if (getOutputMode() === "json") printResult(modelIds);
            else
                printTable(
                    modelIds.map((model) => ({ model })),
                    ["model"],
                );
        } catch (err) {
            printError(
                `Failed to fetch upstream models: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const test = new Command("test")
    .description("Test an endpoint/model before registering it")
    .requiredOption("--base-url <url>", "OpenAI-compatible base URL")
    .requiredOption("--bearer-token <token>", "Upstream bearer token")
    .requiredOption("--model <model>", "Upstream model id")
    .action(async (opts) => {
        const key = requireKey();
        try {
            const res = await gen<Record<string, unknown>>(
                "/account/my-models/test",
                {
                    apiKey: key,
                    method: "POST",
                    body: {
                        baseUrl: opts.baseUrl,
                        bearerToken: opts.bearerToken,
                        model: opts.model,
                    },
                },
            );
            printResult(res);
        } catch (err) {
            printError(
                `Failed to test model: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const myModelsCommand = new Command("my-models")
    .description("Manage your invite-only community text models")
    .addCommand(list)
    .addCommand(create)
    .addCommand(update)
    .addCommand(remove)
    .addCommand(models)
    .addCommand(test);
