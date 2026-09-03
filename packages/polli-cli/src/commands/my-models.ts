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
    [
        "--completion-image-price <number>",
        "Generated-image price (per image when --image-pricing request; per token when --image-pricing tokens)",
    ],
    ["--completion-video-price <number>", "Generated-video price per second"],
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
    "completionImagePrice",
    "completionVideoPrice",
] as const;

type PriceOptionKey = (typeof PRICE_OPTION_KEYS)[number];

interface MyModelBase {
    id: string;
    modelId: string;
    name: string;
    title: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    visibility: "private" | "public";
    createdAt: string;
    updatedAt: string;
    [key: string]: unknown;
}

interface ProxyMyModel extends MyModelBase {
    type: "proxy";
    paidOnly: boolean;
    modality:
        | "text"
        | "image"
        | "video"
        | "transcription"
        | "speech"
        | "embedding";
    imagePricing: "request" | "tokens";
    completionImagePrice: number;
    completionVideoPrice: number;
    // /account/my-models/test detects edit support from endpoint probes.
    inputModalities: string[];
    requiredSafetyFeatures: string[];
    fallbacks: string[];
}

interface PromptAgentMyModel extends MyModelBase {
    type: "prompt_agent";
}

interface EndpointAgentMyModel extends MyModelBase {
    type: "endpoint_agent";
    perUserRpm: number | null;
}

type MyModel = ProxyMyModel | PromptAgentMyModel | EndpointAgentMyModel;

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

function commaSeparatedList(value: unknown): string[] {
    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export function modelBody(
    opts: Record<string, unknown>,
    includeRequired: boolean,
) {
    const body: Record<string, unknown> = readPriceOptions(opts);
    const fields = [
        ["name", "name"],
        ["title", "title"],
        ["description", "description"],
        ["baseUrl", "baseUrl"],
        ["upstreamModel", "upstreamModel"],
        ["bearerToken", "bearerToken"],
        ["paidOnly", "paidOnly"],
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

    // Create only. UpdateEndpointSchema has no modality — a model's family
    // is fixed at registration, so update must not send this field.
    if (includeRequired && opts.modality !== undefined) {
        if (
            opts.modality !== "text" &&
            opts.modality !== "image" &&
            opts.modality !== "video" &&
            opts.modality !== "transcription" &&
            opts.modality !== "speech" &&
            opts.modality !== "embedding"
        ) {
            fail(
                "--modality must be 'text', 'image', 'video', 'transcription', 'speech', or 'embedding'",
            );
        }
        body.modality = opts.modality;
    }

    if (opts.imagePricing !== undefined) {
        if (opts.imagePricing !== "request" && opts.imagePricing !== "tokens") {
            fail("--image-pricing must be 'request' or 'tokens'");
        }
        body.imagePricing = opts.imagePricing;
    }

    // An empty string clears the list, which is why this checks for the flag
    // being present rather than for a truthy value.
    if (opts.fallbacks !== undefined) {
        body.fallbacks = commaSeparatedList(opts.fallbacks);
    }

    if (opts.inputModalities !== undefined) {
        body.inputModalities = commaSeparatedList(opts.inputModalities);
    }

    if (opts.requiredSafety !== undefined) {
        body.requiredSafetyFeatures =
            String(opts.requiredSafety).trim() === "none"
                ? []
                : commaSeparatedList(opts.requiredSafety);
    }

    if (includeRequired) {
        for (const required of ["name", "title"]) {
            if (!body[required]) {
                fail(
                    `--${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`,
                );
            }
        }
        if (!body.baseUrl) fail("--base-url is required");
        if (!body.bearerToken) fail("--bearer-token is required");
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
            type: model.type,
            modality: model.type === "proxy" ? model.modality : "text",
            // Price and billing mode read as one unit, so they share a cell
            // rather than widening an already wide table by two columns.
            image_price:
                model.type === "proxy" && model.modality === "image"
                    ? `${model.completionImagePrice}/${model.imagePricing === "tokens" ? "token" : "req"}`
                    : "-",
            video_price:
                model.type === "proxy" && model.modality === "video"
                    ? `${model.completionVideoPrice}/sec`
                    : "-",
            inputs:
                model.type === "proxy"
                    ? model.inputModalities?.join(", ") || "-"
                    : "-",
            visibility:
                model.type === "proxy" && model.paidOnly
                    ? `${model.visibility} (paid only)`
                    : model.visibility,
            upstream:
                model.type === "proxy" && model.modality === "video"
                    ? "-"
                    : model.upstreamModel,
            base_url: model.baseUrl,
            fallbacks:
                model.type === "proxy"
                    ? model.fallbacks?.join(", ") || "-"
                    : "-",
            description: model.description ?? "-",
        })),
        [
            "id",
            "model",
            "title",
            "type",
            "modality",
            "image_price",
            "video_price",
            "inputs",
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
        .description("Register a community model endpoint")
        .requiredOption("--name <name>", "Model name")
        .requiredOption("--title <title>", "Display title shown in the catalog")
        .option("--description <text>", "Model description")
        .option(
            "--base-url <url>",
            "OpenAI-compatible base URL, or exact video endpoint URL",
        )
        .option(
            "--upstream-model <model>",
            "Upstream model id (not used for video)",
        )
        .option("--bearer-token <token>", "Upstream bearer token")
        .option(
            "--visibility <visibility>",
            "Model visibility: private (default) or public",
        )
        .option(
            "--paid-only",
            "Only accept Paid Pollen, for a pay-as-you-go upstream whose cost free Quest Pollen would not cover",
        )
        .option("--no-paid-only", "Accept Quest or Paid Pollen (default)")
        .option(
            "--fallbacks <ids>",
            "Comma-separated community model ids tried in order when this model's upstream fails; empty string clears them",
        )
        .option(
            "--input-modalities <types>",
            "Comma-separated accepted inputs: text,image,audio,video",
        )
        .option(
            "--required-safety <features>",
            "Comma-separated required checks: privacy,secrets,sexual,violence,shield; none clears them",
        )
        .option(
            "--modality <modality>",
            "Model family: text (default), image, video, transcription, speech, or embedding",
        )
        .option(
            "--image-pricing <mode>",
            "Image billing: request (per image, default) or tokens",
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
        .option(
            "--base-url <url>",
            "OpenAI-compatible base URL, or exact video endpoint URL",
        )
        .option(
            "--upstream-model <model>",
            "Upstream model id (not used for video)",
        )
        .option("--bearer-token <token>", "Upstream bearer token")
        .option(
            "--visibility <visibility>",
            "Model visibility: private or public",
        )
        .option(
            "--paid-only",
            "Only accept Paid Pollen, for a pay-as-you-go upstream whose cost free Quest Pollen would not cover",
        )
        .option("--no-paid-only", "Accept Quest or Paid Pollen")
        .option(
            "--fallbacks <ids>",
            "Comma-separated community model ids tried in order when this model's upstream fails; empty string clears them",
        )
        .option(
            "--input-modalities <types>",
            "Comma-separated accepted inputs: text,image,audio,video",
        )
        .option(
            "--required-safety <features>",
            "Comma-separated required checks: privacy,secrets,sexual,violence,shield; none clears them",
        )
        // No --modality here on purpose: UpdateEndpointSchema has no modality
        // field, so a registered model's family is fixed at creation.
        .option(
            "--image-pricing <mode>",
            "Image billing: request (per image) or tokens",
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
    .requiredOption(
        "--base-url <url>",
        "OpenAI-compatible base URL, or exact video endpoint URL",
    )
    .requiredOption("--bearer-token <token>", "Upstream bearer token")
    .option("--model <model>", "Upstream model id (not used for video)")
    .option(
        "--modality <modality>",
        "Model family: text (default), image, video, transcription, speech, or embedding",
    )
    .action(async (opts) => {
        const key = requireKey();
        if (
            opts.modality !== undefined &&
            opts.modality !== "text" &&
            opts.modality !== "image" &&
            opts.modality !== "video" &&
            opts.modality !== "transcription" &&
            opts.modality !== "speech" &&
            opts.modality !== "embedding"
        ) {
            fail(
                "--modality must be 'text', 'image', 'video', 'transcription', 'speech', or 'embedding'",
            );
        }
        const modality = opts.modality ?? "text";
        if (modality !== "video" && !opts.model) {
            fail("--model is required unless --modality is video");
        }
        try {
            const res = await gen<Record<string, unknown>>(
                "/account/my-models/test",
                {
                    apiKey: key,
                    method: "POST",
                    body: {
                        baseUrl: opts.baseUrl,
                        bearerToken: opts.bearerToken,
                        ...(opts.model && { model: opts.model }),
                        modality,
                    },
                },
            );
            printResult(res);
        } catch (err) {
            fail("Failed to test model", err);
        }
    });

export const myModelsCommand = new Command("my-models")
    .description(
        "Manage private and published community text, image, video, transcription, speech, and embedding models",
    )
    .addCommand(list)
    .addCommand(create)
    .addCommand(update)
    .addCommand(remove)
    .addCommand(models)
    .addCommand(test);
