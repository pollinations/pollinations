import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function createEmbeddings(params, context) {
    requireApiKey(context);
    const result = await fetchJsonWithAuth(
        buildUrl("/v1/embeddings"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        },
        context,
    );
    return createMCPResponse([createTextContent(result, true)]);
}

export const embeddingTools = [
    [
        "createEmbeddings",
        "Proxy one OpenAI-compatible embedding request through Gen and return its raw JSON response.",
        z
            .object({
                input: z.union([
                    z.string(),
                    z.array(z.unknown()),
                    z.object({}).passthrough(),
                ]),
                model: z
                    .string()
                    .optional()
                    .describe("Embedding model; use listModels"),
            })
            .passthrough(),
        createEmbeddings,
    ],
];
