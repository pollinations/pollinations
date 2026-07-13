import { validator } from "@shared/middleware/validator.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { handleRegisterServer } from "@/image/handler.ts";
import { auth } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import {
    createChatCompletionHandlers,
    createImageVideoHandlers,
    createSimpleTextHandlers,
    createTextContentHandlers,
} from "./proxy.ts";

const LEGACY_TEXT_ALIASES = [
    "openai",
    "openai-fast",
    "gpt-oss",
    "gpt-oss-20b",
    "ovh-reasoning",
] as const;

const legacyTextModelOptions = {
    defaultModel: "openai-fast",
    modelMap: Object.fromEntries(
        LEGACY_TEXT_ALIASES.map((alias) => [alias, "gpt-oss"]),
    ),
};

const legacyImageModelOptions = {
    defaultModel: "sana",
    modelMap: {
        sana: "sana",
        flux: "sana",
        "z-image": "sana",
        zimage: "sana",
        turbo: "sana",
    },
};

const promptValidator = validator(
    "param",
    z.object({ prompt: z.string().min(1) }),
);

function legacyTextModels() {
    const model = modelInfoFromDefinition("gpt-oss", TEXT_SERVICES["gpt-oss"]);
    return [
        {
            ...model,
            name: "openai-fast",
            aliases: [
                ...LEGACY_TEXT_ALIASES.filter((id) => id !== "openai-fast"),
            ],
            tier: "anonymous",
            community: false,
            vision: false,
            audio: false,
        },
    ];
}

export const legacyTextRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .get("/models", (c) => c.json(legacyTextModels()))
    .get("/openai/models", (c) =>
        c.json({
            object: "list",
            data: [
                {
                    id: "openai-fast",
                    object: "model",
                    created: Date.now(),
                    owned_by: "ovhcloud",
                },
            ],
        }),
    )
    .use("*", auth())
    .use("*", frontendKeyRateLimit)
    .use("*", balance)
    .post("/", ...createTextContentHandlers(legacyTextModelOptions))
    .post(
        "/v1/chat/completions",
        ...createChatCompletionHandlers(legacyTextModelOptions),
    )
    .post("/openai", ...createChatCompletionHandlers(legacyTextModelOptions))
    .post("/openai/*", ...createChatCompletionHandlers(legacyTextModelOptions))
    .get(
        "/:prompt{[\\s\\S]+}",
        promptValidator,
        validator("query", GenerateTextRequestQueryParamsSchema),
        ...createSimpleTextHandlers(legacyTextModelOptions),
    );

export const legacyImageRoutes = new Hono<Env>()
    .use("*", edgeRateLimit)
    .get("/models", (c) => c.json(["sana"]))
    .get("/register", handleRegisterServer)
    .post("/register", handleRegisterServer)
    .use("*", auth())
    .use("*", frontendKeyRateLimit)
    .use("*", balance)
    .get(
        "/prompt/:prompt{[\\s\\S]+}",
        promptValidator,
        ...createImageVideoHandlers(legacyImageModelOptions),
    )
    .get(
        "/:prompt{[\\s\\S]+}",
        promptValidator,
        ...createImageVideoHandlers(legacyImageModelOptions),
    );
