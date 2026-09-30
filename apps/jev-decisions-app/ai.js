// ai.js — Jev Decisions App: API config, auth, and decision requests

const API = "https://gen.pollinations.ai";
const ENTER = "https://enter.pollinations.ai";
const APP_KEY = "pk_jev_decisions_app_v1";

// ── Auth (in-memory, volatile) ───────────────────────────────────────────────

let _apiKey = null;

export const getApiKey = () => _apiKey;
export const setApiKey = (key) => {
    _apiKey = key;
};
export const resetApiKey = () => {
    _apiKey = null;
};
export const clearApiKey = resetApiKey;

export function extractApiKeyFromFragment() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    try {
        const key = new URLSearchParams(hash).get("api_key");
        if (key && /^(sk_|plll_pk_|pk_)/.test(key)) {
            setApiKey(key);
            return key;
        }
        return null;
    } catch {
        return null;
    }
}

export function getAuthorizeUrl(prompt = "") {
    const redirect = window.location.href.split("#")[0];
    const params = new URLSearchParams({
        redirect_url: redirect,
        app_key: APP_KEY,
        budget: "5",
        models: "typesafe/jev-1.13",
        permissions: "profile,usage",
    });
    if (prompt) params.set("prompt", encodeURIComponent(prompt));
    return `${ENTER}/authorize?${params}`;
}

async function fetchAccount(apiKey, path) {
    const res = await fetch(`${ENTER}/api/account/${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
    return res.json();
}

export const fetchProfile = (apiKey) => fetchAccount(apiKey, "profile");
export const fetchBalance = (apiKey) => fetchAccount(apiKey, "balance");

// ── Decision API ─────────────────────────────────────────────────────────────

export const DEFAULT_DECISION_MODEL = "jev"; // alias for typesafe/jev-1.13

export async function postDecision(apiKey, state, questions) {
    const body = {
        model: DEFAULT_DECISION_MODEL,
        state,
        questions,
    };

    const res = await fetch(`${API}/alpha/decisions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        let error;
        try {
            const err = JSON.parse(text);
            error = err.error?.message || err.error || text;
        } catch {
            error = text || `Error ${res.status}`;
        }
        const err = new Error(error);
        err.status = res.status;
        err.body = text;
        throw err;
    }

    return res.json();
}

// ── Utilities ───────────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
    {
        value: "noul",
        label: "Yes/No",
        emoji: "❔",
        description: "Ask a yes/no question for a probability score",
    },
    {
        value: "choice",
        label: "Choice",
        emoji: "👆",
        description: "Pick between named options",
    },
    {
        value: "score",
        label: "Score",
        emoji: "📊",
        description: "Rate something on an ordered scale",
    },
];

export function formatProbability(prob) {
    return `${Math.round(prob * 100)}%`;
}

export function formatScore(score, legend) {
    const entries = Object.entries(legend || {});
    if (entries.length === 0) return score.toFixed(2);
    const lowerIdx = Math.floor(score);
    const upperIdx = Math.min(lowerIdx + 1, entries.length - 1);
    const lower = entries[lowerIdx]?.[1] ?? entries[lowerIdx]?.[0] ?? "";
    const upper = entries[upperIdx]?.[1] ?? entries[upperIdx]?.[0] ?? "";
    if (lower === upper) return `${lower} (${score.toFixed(2)})`;
    return `${lower} ↔ ${upper} (${score.toFixed(2)})`;
}
