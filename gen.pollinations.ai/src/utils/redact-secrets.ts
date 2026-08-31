// Local, zero-cost detection of structured secrets for the `secrets` safety
// feature. Runs in-Worker over the full request text — no window and no
// Bedrock call — so an unscanned prefix cannot leak a secret past the scan.
//
// Primary engine: `redact-wasm`, the vendored pattern engine of the
// maintained `redact-core` Rust crate (see README of censgate/redact). It
// recognizes credential/secret types — AWS access keys, JWTs, API keys,
// tokens — with checksum validation (Luhn cards, AWS access keys, JWTs), plus
// 30+ PII types that belong to the `privacy` feature instead.
//
// Complement: a small set of patterns for entities no maintained lib ships —
// Pollinations keys (`sk_`/`pk_`), context-scored CVV/PIN/expiry/password and
// AWS secret keys, ABA-routing numbers, and card numbers written in separated
// groups (which the redact card regex does not match).
//
// The engine is the vendored `redact-wasm` web target. The Workers runtime
// (and the vitest workers pool) resolve `*.wasm` imports to a precompiled
// `WebAssembly.Module` exposed as the module's `default` export — the runtime
// disallows codegen from raw bytes, so the web glue's `initSync` is called
// with that precompiled module rather than bytes.
import { initSync, RedactEngine } from "./redact/redact_wasm.js";
import * as wasmNamespace from "./redact/redact_wasm_bg.wasm";

initSync({ module: wasmNamespace.default });
const engine = new RedactEngine();

type AnalysisEntity = {
    entity_type: string;
    start: number;
    end: number;
    score: number;
};

type AnalysisResult = {
    detected_entities?: AnalysisEntity[];
};

// redact-wasm entity types that count as secrets. Everything else it detects
// (email, phone, URL, hash, date...) belongs to the `privacy` feature and
// must not block here.
const REDACT_SECRET_ENTITIES = new Set([
    "AWS_ACCESS_KEY",
    "PRIVATE_KEY",
    "JWT_TOKEN",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "SLACK_TOKEN",
    "SLACK_WEBHOOK",
    "STRIPE_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "NPM_TOKEN",
    "PYPI_TOKEN",
    "SENDGRID_API_KEY",
    "TWILIO_API_KEY",
    "TELEGRAM_BOT_TOKEN",
    "HASHICORP_VAULT_TOKEN",
    "DATABASE_CONNECTION_STRING",
    "CREDIT_CARD",
    "US_BANK_NUMBER",
]);

// Normalize redact names to the entity names the `secrets` feature reports.
const ENTITY_NAME_MAP: Record<string, string> = {
    CREDIT_CARD: "CREDIT_DEBIT_CARD_NUMBER",
    US_BANK_NUMBER: "US_BANK_ACCOUNT_NUMBER",
};

const CONTEXT_WINDOW = 50;

type ComplementPattern = {
    type: string;
    regex: RegExp;
    context?: string[];
};

const COMPLEMENT_PATTERNS: ComplementPattern[] = [
    // Pollinations keys: `sk_` + 32 alphanumeric, `pk_` + 16 alphanumeric.
    { type: "POLLINATIONS_SECRET_KEY", regex: /\bsk_[A-Za-z0-9]{32}\b/g },
    { type: "POLLINATIONS_PUBLIC_KEY", regex: /\bpk_[A-Za-z0-9]{16}\b/g },
    {
        type: "AWS_SECRET_KEY",
        regex: /\b[A-Za-z0-9/+=]{40}\b/g,
        context: ["aws", "secret key", "secret access key", "access key"],
    },
    {
        type: "CREDIT_DEBIT_CARD_CVV",
        regex: /\b\d{3,4}\b/g,
        context: [
            "cvv",
            "cvc",
            "security code",
            "verification code",
            "card verification",
            "cid",
        ],
    },
    {
        type: "CREDIT_DEBIT_CARD_EXPIRY",
        regex: /\b(?:0[1-9]|1[0-2])\s*\/\s*\d{2}\b/g,
        context: [
            "exp",
            "expiry",
            "expires",
            "expiration",
            "valid thru",
            "mm/yy",
        ],
    },
    {
        type: "PIN",
        regex: /\b\d{4,5}\b/g,
        context: ["pin", "passcode"],
    },
    {
        type: "PASSWORD",
        regex: /\b(?:password|passwd|pwd|passphrase)\b[:\s=]*([^\s,;"]{6,})/g,
        context: ["password", "passwd", "pwd", "passphrase"],
    },
];

const CARD_DIGITS_RE = /\b\d[\d\s-]{11,18}\d\b/g;
const ROUTING_NUMBER_RE = /\b\d{9}\b/g;

export function detectSecretsInTexts(texts: string[]): Set<string> {
    const types = new Set<string>();
    for (const text of texts) {
        for (const type of scanText(text)) {
            types.add(type);
        }
    }
    return types;
}

function scanText(text: string): Set<string> {
    const types = new Set<string>();

    let analysis: AnalysisResult | undefined;
    try {
        analysis = JSON.parse(engine.analyze(text)) as AnalysisResult;
    } catch {
        analysis = undefined;
    }
    for (const entity of analysis?.detected_entities ?? []) {
        if (!REDACT_SECRET_ENTITIES.has(entity.entity_type)) continue;
        types.add(ENTITY_NAME_MAP[entity.entity_type] ?? entity.entity_type);
    }

    for (const { type, regex, context } of COMPLEMENT_PATTERNS) {
        for (const match of text.matchAll(regex)) {
            const start = match.index;
            if (start === undefined) continue;
            if (
                context &&
                !hasContext(text, start, start + match[0].length, context)
            ) {
                continue;
            }
            types.add(type);
        }
    }

    // Card numbers in separated groups: Luhn-validated digit runs of 13-19
    // digits, regardless of spacing. The redact card regex only matches the
    // unspaced shape, so separated groups are caught here.
    for (const match of text.matchAll(CARD_DIGITS_RE)) {
        const digits = match[0].replace(/[\s-]/g, "");
        if (digits.length < 13 || digits.length > 19) continue;
        if (!luhnValid(digits)) continue;
        types.add("CREDIT_DEBIT_CARD_NUMBER");
    }

    // US ABA routing numbers are nine digits with a check digit; without the
    // checksum a bare nine-digit number is too common to flag.
    for (const match of text.matchAll(ROUTING_NUMBER_RE)) {
        if (!routingNumberValid(match[0])) continue;
        types.add("US_BANK_ROUTING_NUMBER");
    }

    return types;
}

function hasContext(
    text: string,
    start: number,
    end: number,
    words: string[],
): boolean {
    const window = text
        .slice(Math.max(0, start - CONTEXT_WINDOW), end + CONTEXT_WINDOW)
        .toLowerCase();
    return words.some((word) =>
        new RegExp(`\\b${escapeRegExp(word)}\\b`).test(window),
    );
}

function luhnValid(digits: string): boolean {
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index--) {
        let value = digits.charCodeAt(index) - 48;
        if (double) {
            value *= 2;
            if (value > 9) value -= 9;
        }
        sum += value;
        double = !double;
    }
    return sum % 10 === 0;
}

function routingNumberValid(digits: string): boolean {
    if (digits.length !== 9) return false;
    let sum = 0;
    for (let index = 0; index < 9; index++) {
        const value = digits.charCodeAt(index) - 48;
        sum += value * [3, 7, 1][index % 3];
    }
    return sum % 10 === 0;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
