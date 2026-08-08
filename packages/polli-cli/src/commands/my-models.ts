import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    fail,
    getOutputMode,
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

interface MyModel {
    id: string;
    modelId: string;
    name: string;
    title: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    visibility: "private" | "public";
    fallbackModelIds: string[];
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

function readPriceOptions(opts: Record<string, unknown>) {
    const prices: Partial<Record<PriceOptionKey, number>> = {};
    for (const key of PRICE_OPTION_KEYS) {
        if (opts[key] === undefined) continue;
        const value = Number(opts[key]);
        if (!Number.isFinite(value) || value < 0) {
            fail(
                `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a non-negative number`,
            );
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
        ["title", "title"],
        ["description", "description"],
        ["baseUrl", "baseUrl"],
        ["upstreamModel", "upstreamModel"],
        ["bearerToken", "bearerToken"],
    ] as const;

    for (const [optionKey, bodyKey] of fields) {
        if (opts[optionKey] !== undefined) body[bodyKey] = opts[optionKey];
    }

    if (opts.visibility !== undefined) {
        if (opts.visibility !== "private" && opts.visibility !== "public") {
            fail("--visibility must be 'private' or 'public'");
        }
        body.visibility = opts.visibility;
    }

    // An empty string clears the list, which is why this checks for the flag
    // being present rather than for a truthy value.
    if (opts.fallbackModels !== undefined) {
        body.fallbackModelIds = String(opts.fallbackModels)
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0);
    }

    if (opts.inputModalities !== undefined) {
        body.inputModalities = String(opts.inputModalities)
            .split(",")
            .map((modality) => modality.trim())
            .filter((modality) => modality.length > 0);
    }

    if (opts.outputModalities !== undefined) {
        body.outputModalities = String(opts.outputModalities)
            .split(",")
            .map((modality) => modality.trim())
            .filter((modality) => modality.length > 0);
    }

    if (opts.videoCapabilities !== undefined) {
        body.videoCapabilities = String(opts.videoCapabilities)
            .split(",")
            .map((capability) => capability.trim())
            .filter((capability) => capability.length > 0);
    }

    if (includeRequired) {
        for (const required of ["name", "title", "baseUrl", "bearerToken"]) {
            if (!body[required]) {
                fail(
                    `--${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`,
                );
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
            title: model.title,
            visibility: model.visibility,
            upstream: model.upstreamModel,
            base_url: model.baseUrl,
            fallbacks: model.fallbackModelIds?.join(", ") || "-",
            description: model.description ?? "-",
        })),
        [
            "id",
            "model",
            "title",
            "visibility",
            "upstream",
            "base_url",
            "fallbacks",
            "description",
        ],
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
            fail("Failed to list my models", err);
        }
    });

const create = addPriceOptions(
    new Command("create")
        .description("Register an OpenAI-compatible model endpoint")
        .requiredOption("--name <name>", "Model name")
        .requiredOption("--title <title>", "Display title shown in the catalog")
        .option("--description <text>", "Model description")
        .requiredOption("--base-url <url>", "OpenAI-compatible base URL")
        .option("--upstream-model <model>", "Upstream model id")
        .requiredOption("--bearer-token <token>", "Upstream bearer token")
        .option(
            "--visibility <visibility>",
            "Model visibility: private (default) or public",
        )
        .option(
            "--fallback-models <ids>",
            "Comma-separated community model ids tried in order when this model's upstream fails; empty string clears them",
        )
        .option(
            "--input-modalities <types>",
            "Comma-separated accepted inputs: text,image,audio,video",
        )
        .option(
            "--output-modalities <types>",
            "Comma-separated produced outputs: text,image,audio,video",
        )
        .option(
            "--video-capabilities <caps>",
            "Comma-separated video capabilities: text-to-video,image-to-video",
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
        fail("Failed to create model", err);
    }
});

const update = addPriceOptions(
    new Command("update")
        .description("Update one of your models")
        .argument("<id>", "Model id")
        .option("--name <name>", "Model name")
        .option("--title <title>", "Display title shown in the catalog")
        .option("--description <text>", "Model description")
        .option("--base-url <url>", "OpenAI-compatible base URL")
        .option("--upstream-model <model>", "Upstream model id")
        .option("--bearer-token <token>", "Upstream bearer token")
        .option(
            "--visibility <visibility>",
            "Model visibility: private or public",
        )
        .option(
            "--fallback-models <ids>",
            "Comma-separated community model ids tried in order when this model's upstream fails; empty string clears them",
        )
        .option(
            "--input-modalities <types>",
            "Comma-separated accepted inputs: text,image,audio,video",
        )
        .option(
            "--output-modalities <types>",
            "Comma-separated produced outputs: text,image,audio,video",
        )
        .option(
            "--video-capabilities <caps>",
            "Comma-separated video capabilities: text-to-video,image-to-video",
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
        fail("Failed to update model", err);
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
            fail("Failed to delete model", err);
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
            fail("Failed to fetch upstream models", err);
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
            fail("Failed to test model", err);
        }
    });

export const myModelsCommand = new Command("my-models")
    .description("Manage private and published community text models")
    .addCommand(list)
    .addCommand(create)
    .addCommand(update)
    .addCommand(remove)
    .addCommand(models)
    .addCommand(test);
