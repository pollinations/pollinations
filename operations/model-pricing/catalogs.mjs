import { rate } from "./analyze.mjs";

// Provider catalogs are independent of the registry-derived provider/model list.
// A new registry provider without an entry here must remain an explicit gap.
export const CATALOGS = {
    deepinfra: {
        url: "https://api.deepinfra.com/models/list",
        id: "model_name",
    },
    ovhcloud: {
        url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
        key: "OVHCLOUD_API_KEY",
        items: "data",
    },
    xai: {
        url: "https://api.x.ai/v1/language-models",
        key: "XAI_API_KEY",
        items: "models",
    },
    openai: {
        url: "https://api.openai.com/v1/models",
        key: "OPENAI_API_KEY",
        items: "data",
    },
    mistral: {
        url: "https://api.mistral.ai/v1/models",
        key: "MISTRAL_API_KEY",
        items: "data",
    },
    fireworks: {
        url: "https://api.fireworks.ai/inference/v1/models",
        key: "FIREWORKS_NEO_API_KEY",
        items: "data",
    },
    vercel: {
        url: "https://ai-gateway.vercel.sh/v1/models",
        key: "AI_GATEWAY_API_KEY",
        items: "data",
    },
    alibaba: {
        url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
        key: "DASHSCOPE_API_KEY",
        items: "data",
    },
    inferenceport: {
        url: "https://api.inferenceport.ai/v1/models",
        key: "INFERENCEPORT_API_KEY",
        items: "data",
    },
    elevenlabs: {
        url: "https://api.elevenlabs.io/v1/models",
        key: "ELEVENLABS_API_KEY",
        header: "xi-api-key",
        prefix: "",
        id: "model_id",
    },
    fal: {
        url: "https://api.fal.ai/v1/models?limit=1000",
        key: "FAL_KEY",
        prefix: "Key ",
        items: "models",
        id: "endpoint_id",
        cursor: "next_cursor",
    },
    replicate: {
        url: "https://api.replicate.com/v1/models",
        key: "REPLICATE_API_TOKEN",
        items: "results",
        next: "next",
    },
    google: {
        url: "https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=100",
        key: "GOOGLE_ACCESS_TOKEN",
        items: "publisherModels",
        id: "name",
        cursor: "nextPageToken",
        cursorParam: "pageToken",
    },
    // The existing AWS CLI signs these read-only catalog operations.
    aws: {
        url: "https://bedrock.us-east-1.amazonaws.com/foundation-models",
        items: "modelSummaries",
        id: "modelId",
    },
    // These sources still need model/variant-specific extraction. Fetching the
    // document never counts as having verified a model's price or lifecycle.
    assemblyai: { url: "https://www.assemblyai.com/pricing", document: true },
    stability: { url: "https://platform.stability.ai/pricing", document: true },
    perplexity: {
        url: "https://docs.perplexity.ai/docs/getting-started/pricing",
        document: true,
    },
    vast: {
        url: "repository:operations/infrastructure/gpu/GPU_INSTANCES.md",
        document: true,
    },
};

export function sameOrigin(url, expected) {
    return (
        URL.canParse(url) &&
        URL.canParse(expected) &&
        new URL(url).origin === new URL(expected).origin
    );
}

export function catalogHeaders(url, env = process.env) {
    const config = Object.values(CATALOGS).find((c) => sameOrigin(url, c.url));
    if (!config?.key || !env[config.key]) return {};
    return {
        [config.header ?? "Authorization"]:
            `${config.prefix ?? "Bearer "}${env[config.key]}`,
    };
}

export function matchCatalogModel(provider, items, upstream) {
    if (!upstream) return null;
    const matches = items.filter((item) => {
        const id = item[CATALOGS[provider]?.id ?? "id"];
        return (
            id === upstream ||
            (provider === "google" &&
                id === `publishers/google/models/${upstream}`) ||
            (provider === "xai" && item.aliases?.includes(upstream))
        );
    });
    return matches.length === 1 ? matches[0] : null;
}

export function catalogFacts(provider, item) {
    const facts = {
        observedRates: {},
        retirementDate: null,
        lifecycle: "unknown",
        gaps: [],
    };
    if (
        provider === "openai" &&
        typeof item.shutdown_date === "string" &&
        Number.isFinite(Date.parse(item.shutdown_date))
    )
        facts.retirementDate = item.shutdown_date;
    if (provider === "mistral" && item.deprecation) {
        facts.lifecycle = "Deprecating";
        facts.deprecation = item.deprecation;
        facts.providerReplacement = item.deprecation_replacement_model ?? null;
    }
    if (provider === "aws") {
        facts.lifecycle =
            item.modelLifecycle?.status === "LEGACY"
                ? "Deprecating"
                : "unknown";
    }
    if (provider === "deepinfra") {
        facts.providerReplacement = item.replaced_by ?? null;
        if (rate(item.deprecated) > 0) {
            facts.lifecycle = "Deprecating";
            facts.deprecationDate = new Date(
                Number(item.deprecated) * 1000,
            ).toISOString();
            facts.gaps.push(
                "Deprecation timestamp is not a confirmed shutdown deadline",
            );
        }
        const p = item.pricing;
        if (p?.type === "tokens" && (p.discount == null || p.discount === 0)) {
            for (const [field, key] of [
                ["promptTextTokens", "cents_per_input_token"],
                ["completionTextTokens", "cents_per_output_token"],
            ])
                if (rate(p[key]) !== null)
                    facts.observedRates[field] = Number(p[key]) / 100;
            facts.priceBasis =
                "DeepInfra advertised standard token rates, converted from cents/token to USD/token";
        } else
            facts.gaps.push(
                "DeepInfra discount or non-token pricing needs separate unit/discount verification",
            );
    }
    if (provider === "ovhcloud" && item.pricing?.currency_unit === "USD") {
        for (const [field, key] of [
            ["promptTextTokens", "prompt"],
            ["completionTextTokens", "completion"],
        ])
            if (rate(item.pricing[key]) !== null)
                facts.observedRates[field] = Number(item.pricing[key]);
        facts.priceBasis = "OVHcloud advertised USD base rates per token";
    }
    if (provider === "xai") {
        // Official API schema: cents per 100 million tokens, not USD per million.
        // https://docs.x.ai/developers/rest-api-reference/inference/models
        for (const [field, key] of [
            ["promptTextTokens", "prompt_text_token_price"],
            ["completionTextTokens", "completion_text_token_price"],
            ["promptCachedTokens", "cached_prompt_text_token_price"],
        ])
            if (rate(item[key]) !== null)
                facts.observedRates[field] = Number(item[key]) / 1e10;
        facts.priceBasis =
            "xAI advertised standard short-context rates (cents/100M tokens converted to USD/token)";
    }
    if (!Object.keys(facts.observedRates).length)
        facts.gaps.push(
            "Catalog metadata does not verify this route's configured prices",
        );
    if (!facts.retirementDate)
        facts.gaps.push(
            "No verified shutdown date; catalog presence does not establish lifecycle coverage",
        );
    return facts;
}
