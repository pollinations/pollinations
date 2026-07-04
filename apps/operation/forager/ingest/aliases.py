"""Provider aliases — the one central place that maps raw strings to a canonical
provider slug. Not tied to any single source: the same alias list is used to
match Wise payment counterparties today and can match invoice text or anything
else tomorrow.

For now this lives in code (edit this file to add a provider or an alias); later
it could move to a Tinybird table without changing the callers.

Two shapes, because there are two matching modes:

  - PROVIDER_ALIASES: human/free-text strings, matched by case-insensitive
    SUBSTRING (a bank descriptor like "AMAZON WEB SERVICES EMEA SARL" contains
    "amazon web"). This is the central provider list + its aliases.
  - MODEL_TAG_ALIASES: machine `model_provider_used` tags from Tinybird, matched
    EXACTLY. Kept separate on purpose — it only holds tags that differ from the
    canonical slug (azure-2 -> azure), never identity/pass-through entries, which
    the burn tests enforce.

Operating-expense classification (payroll/saas/office…) carries a category and
stays in connectors/wise.py `OPS_ALIAS`; invoice-text classification lives in
invoices/harvest.py `PROVIDERS` and could later read from here.
"""

# canonical provider slug -> identifying strings (lowercased), matched by substring
PROVIDER_ALIASES: dict[str, list[str]] = {
    "google": ["google cloud", "google cloud emea"],
    "aws": ["automat-it", "amazon web", "aws emea"],
    "alibaba": ["alibaba", "aliyun", "ant alibaba"],
    "azure": ["microsoft", "azure"],
    "runpod": ["runpod"],
    "lambda": ["lambda labs", "lambda cloud"],
    "deepinfra": ["deepinfra", "deep infra"],
    "fireworks": ["fireworks"],
    "openrouter": ["openrouter"],
    "openai": ["openai"],
    "anthropic": ["anthropic", "claude"],
    "xai": ["grok", "x.ai", "xai"],
    "replicate": ["replicate"],
    "cloudflare": ["cloudflare"],
    "ovhcloud": ["ovh"],
    "elevenlabs": ["elevenlabs", "eleven labs"],
    "perplexity": ["perplexity"],
    "scaleway": ["scaleway"],
    "modal": ["modal"],
    "digitalocean": ["digitalocean", "digital ocean"],
    "vast.ai": ["vast.ai", "vast ai"],
    "daytona": ["daytona"],
    "io.net": ["io.net", "io net"],
    "bytedance": ["byteplus", "bytedance"],
    "fal": ["fal.ai", "fal ai"],
    "pruna": ["pruna"],
    "stability": ["stability"],
    "assemblyai": ["assemblyai", "assembly ai"],
    "retell": ["retell ai", "retell"],
}

# raw Tinybird model_provider_used tag -> canonical provider slug (exact match).
# Only tags that differ from the canonical slug belong here.
MODEL_TAG_ALIASES: dict[str, str] = {
    "aws-bedrock": "aws",
    "bedrock": "aws",
    "bedrock (native)": "aws",
    "vastai": "vast.ai",
    "azure-2": "azure",
}
