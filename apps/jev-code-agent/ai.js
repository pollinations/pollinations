// ai.js — Jev Code Agent: decisions API + text generation

const API = "https://gen.pollinations.ai";
const ENTER = "https://enter.pollinations.ai";
const APP_KEY = "pk_jev_code_agent_v1";

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
        models: "typesafe/jev-1.13,openai/gpt-image-1-mini",
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

// ── Decisions API ────────────────────────────────────────────────────────────

export const DEFAULT_DECISION_MODEL = "jev";

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
        const err = new Error(text || `Error ${res.status}`);
        err.status = res.status;
        throw err;
    }

    return res.json();
}

// ── Text Generation API ──────────────────────────────────────────────────────

export async function postChat(
    apiKey,
    messages,
    model = "openai/gpt-image-1-mini",
) {
    const res = await fetch(`${API}/v1/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: 4000,
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(text || `Error ${res.status}`);
        err.status = res.status;
        throw err;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Utilities ───────────────────────────────────────────────────────────────

export function formatProbability(prob) {
    return `${(prob * 100).toFixed(0)}%`;
}

export const AGENT_ACTIONS = {
    explore: {
        label: "Explore",
        emoji: "🔍",
        description: "Understand the codebase or task context",
    },
    plan: {
        label: "Plan",
        emoji: "📝",
        description: "Break down the task into steps",
    },
    code: {
        label: "Code",
        emoji: "✍️",
        description: "Write code for the task",
    },
    test: {
        label: "Test",
        emoji: "🧪",
        description: "Write or run tests",
    },
    review: {
        label: "Review",
        emoji: "🔍",
        description: "Review the code for issues",
    },
    done: {
        label: "Done",
        emoji: "✅",
        description: "Task is complete",
    },
};

export const AGENT_QUESTIONS = {
    action: {
        type: "choice",
        instructions:
            "You are a coding agent. Given the task context, what should you do next? Consider the standard development cycle: explore, plan, code, test, review, done.",
        criteria: {
            explore: "Explore the relevant codebase or gather context",
            plan: "Plan the implementation approach",
            code: "Write or modify the code",
            test: "Write tests or verify the code works",
            review: "Review for quality, security, or correctness",
            done: "The task is complete",
        },
    },
    confident: {
        type: "noul",
        instructions:
            "Given the current state, how confident are you that the action taken is the right call?",
        criteria: {
            true: "High confidence the action is correct",
            false: "Low confidence — consider an alternative",
        },
    },
    complete: {
        type: "noul",
        instructions: "Is the coding task fully complete and functional?",
        criteria: {
            true: "Yes, the task is complete",
            false: "No, more work is needed",
        },
    },
};
