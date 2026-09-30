/**
 * Pollinations integration: BYO Pollen OAuth (authorization-code + PKCE),
 * account info, balance, model discovery, and the models.json/auth.json
 * payloads that configure the real Pi agent inside its WASM sandbox.
 *
 * Everything runs browser-side — both enter.pollinations.ai and
 * gen.pollinations.ai send `Access-Control-Allow-Origin: *`.
 */
import type { PollinationsModel, PollenSession } from "./types";

const ENTER_ORIGIN = "https://enter.pollinations.ai";
/**
 * The Pollinations generation API origin. Override with
 * NEXT_PUBLIC_POLLINATIONS_API_BASE for self-hosted/proxy setups (or local
 * testing); defaults to the public service.
 */
export const GEN_ORIGIN = (
  process.env.NEXT_PUBLIC_POLLINATIONS_API_BASE?.trim() || "https://gen.pollinations.ai"
).replace(/\/+$/, "");

/** Publishable App Key (pk_...). Configure via NEXT_PUBLIC_POLLINATIONS_APP_KEY. */
export const APP_KEY =
  process.env.NEXT_PUBLIC_POLLINATIONS_APP_KEY?.trim() || "";

const POLLEN_KEY_STORAGE = "pi-browser:pollen-key";
const PKCE_VERIFIER_STORAGE = "pi-browser:pkce-verifier";
const OAUTH_STATE_STORAGE = "pi-browser:oauth-state";

/** ---------- session storage (sessionStorage only — never localStorage) ---------- */

export function persistSession(session: PollenSession): void {
  try {
    sessionStorage.setItem(
      POLLEN_KEY_STORAGE,
      JSON.stringify({ ...session, apiKey: session.apiKey })
    );
  } catch {
    // Private mode; keep in memory only.
  }
}

export function clearPersistedSession(): void {
  try {
    sessionStorage.removeItem(POLLEN_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function loadPersistedSession(): PollenSession | null {
  try {
    const raw = sessionStorage.getItem(POLLEN_KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PollenSession;
    if (!parsed?.apiKey || !parsed.apiKey.startsWith("sk_")) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** ---------- OAuth: authorization-code flow with PKCE ---------- */

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

// (base64url helpers kept local; challenge computed above)

export async function buildAuthorizeUrl(options?: {
  scope?: string;
  budget?: number;
  models?: string[];
}): Promise<{ url: string; verifier: string; state: string }> {
  if (!APP_KEY) {
    throw new Error(
      "No Pollinations App Key configured. Set NEXT_PUBLIC_POLLINATIONS_APP_KEY or paste an API key instead."
    );
  }
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64UrlEncode(await sha256(verifier));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: APP_KEY,
    redirect_uri: `${window.location.origin}/`,
    scope: options?.scope ?? "profile usage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (options?.budget != null) params.set("budget", String(options.budget));
  if (options?.models?.length) params.set("models", options.models.join(","));

  // The verifier/state must survive the redirect within this tab.
  try {
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE, verifier);
    sessionStorage.setItem(OAUTH_STATE_STORAGE, state);
  } catch {
    /* ignore */
  }
  return { url: `${ENTER_ORIGIN}/authorize?${params}`, verifier, state };
}

/**
 * Complete the OAuth flow using ?code=&state= on the current URL.
 * Returns null when the URL is not a callback. Throws on mismatched state.
 */
export async function completeOAuthFromUrl(): Promise<{
  session: PollenSession;
  cleanUp: () => void;
} | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  if (!code && !error) return null;

  const cleanUp = () => {
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", url);
  };

  if (error) {
    throw new Error(
      params.get("error_description") ||
        `Pollinations authorization failed: ${error}`
    );
  }
  if (!code) return null;

  let verifier: string | null = null;
  let expectedState: string | null = null;
  try {
    verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE);
    expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE);
    sessionStorage.removeItem(PKCE_VERIFIER_STORAGE);
    sessionStorage.removeItem(OAUTH_STATE_STORAGE);
  } catch {
    /* ignore */
  }
  if (!verifier) {
    throw new Error(
      "Missing PKCE verifier. Please start the connection again from the same tab."
    );
  }
  if (expectedState && state && expectedState !== state) {
    throw new Error("OAuth state mismatch — possible CSRF. Connection aborted.");
  }

  const response = await fetch(`${ENTER_ORIGIN}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: APP_KEY,
      redirect_uri: `${window.location.origin}/`,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const token = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token) throw new Error("Token response contained no access_token.");

  const session: PollenSession = {
    apiKey: token.access_token,
    scope: token.scope,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    source: "oauth",
  };
  // Best-effort profile; the usage scope still works without it.
  session.user = await fetchUserInfo(session.apiKey).catch(() => undefined);
  return { session, cleanUp };
}

/** ---------- account endpoints ---------- */

export async function fetchUserInfo(apiKey: string): Promise<NonNullable<PollenSession["user"]>> {
  const response = await fetch(`${ENTER_ORIGIN}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`userinfo failed (${response.status})`);
  return (await response.json()) as NonNullable<PollenSession["user"]>;
}

export interface BalanceInfo {
  balance: number | null;
  accountBalance?: { total?: number; tier?: string; paid?: number };
}

export async function fetchBalance(apiKey: string): Promise<BalanceInfo> {
  const response = await fetch(`${GEN_ORIGIN}/account/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`balance failed (${response.status})`);
  }
  const data = (await response.json()) as BalanceInfo;
  return data;
}

/** ---------- model discovery ---------- */

/**
 * Fallback catalog used when the models endpoint is unreachable. These are
 * full Pollinations model ids — the exact strings sent as `model` in requests.
 */
export const FALLBACK_MODELS: PollinationsModel[] = [
  {
    name: "openai/gpt-5.4-nano",
    title: "GPT-5.4 Nano",
    publisher: "OpenAI",
    description: "Fast, affordable all-rounder for everyday chat and image questions",
    tools: true,
    reasoning: true,
    context_length: 400000,
    input_modalities: ["text", "image"],
    pricing: { currency: "pollen", promptTextTokens: "0.00000015", completionTextTokens: "0.0000009375" },
    health: { status: "healthy" },
  },
  {
    name: "anthropic/claude-sonnet-5.5",
    title: "Claude Sonnet 5.5",
    publisher: "Anthropic",
    description: "Fast adaptive reasoning for everyday coding and agentic tool use",
    tools: true,
    reasoning: true,
    context_length: 200000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "openai/gpt-5.3-codex",
    title: "GPT-5.3 Codex",
    publisher: "OpenAI",
    description: "Coding-focused reasoner for complex software engineering and agentic coding",
    tools: true,
    reasoning: true,
    context_length: 400000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "x-ai/grok-4.7",
    title: "Grok 4.7",
    publisher: "x-AI",
    description: "Frontier reasoning for long-running coding and agentic tasks",
    tools: true,
    reasoning: true,
    context_length: 256000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "z-ai/glm-5.3-flashx",
    title: "GLM-5.3 FlashX",
    publisher: "Z.ai",
    description: "Faster million-token multimodal reasoning for agents and visual tasks",
    tools: true,
    reasoning: true,
    context_length: 1000000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "xiaomi/mimo-v2.6-flash",
    title: "MiMo v2.6 Flash",
    publisher: "Xiaomi",
    description: "Fast, efficient multimodal reasoning for agents and coding",
    tools: true,
    reasoning: true,
    context_length: 200000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "openai/gpt-6-luna",
    title: "GPT-6 Luna",
    publisher: "OpenAI",
    description: "Efficient reasoning for focused, high-volume tasks",
    tools: true,
    reasoning: true,
    context_length: 400000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
  {
    name: "anthropic/claude-opus-5.5",
    title: "Claude Opus 5.5",
    publisher: "Anthropic",
    description: "Flagship reasoning for demanding coding and multi-step codebase work",
    tools: true,
    reasoning: true,
    context_length: 200000,
    input_modalities: ["text", "image"],
    health: { status: "healthy" },
  },
];

/** Preferred publishers for the curated default list (order matters). */
const PREFERRED_PUBLISHERS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "x-AI",
  "Z.ai",
  "Qwen",
  "Moonshot",
  "DeepSeek",
  "Mistral",
  "Meta",
  "Xiaomi",
  "Microsoft",
];

export async function fetchModels(): Promise<PollinationsModel[]> {
  const response = await fetch(`${GEN_ORIGIN}/models`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`models failed (${response.status})`);
  const all = (await response.json()) as PollinationsModel[];
  return curateModels(all);
}

/** Pick tool-capable, healthy text models and rank the interesting ones first. */
export function curateModels(all: PollinationsModel[]): PollinationsModel[] {
  const eligible = all.filter(
    (m) =>
      m.name &&
      (m.category === undefined || m.category === "text") &&
      m.tools === true &&
      !m.is_specialized &&
      (m.health?.status === undefined || m.health.status === "healthy") &&
      (m.input_modalities === undefined || m.input_modalities.includes("text"))
  );
  const score = (m: PollinationsModel): number => {
    const publisherIndex = PREFERRED_PUBLISHERS.indexOf(m.publisher ?? "");
    let s = publisherIndex === -1 ? PREFERRED_PUBLISHERS.length : publisherIndex;
    if (m.community) s += 5;
    return s * 1_000_000 - Math.min(m.health?.requests ?? 0, 999_999);
  };
  return eligible.sort((a, b) => score(a) - score(b)).slice(0, 36);
}

/** ---------- Pi configuration files ---------- */

/**
 * models.json placed at PI_CODING_AGENT_DIR inside the sandbox. The `id` is
 * sent verbatim as the API `model` field, so it must be the full
 * Pollinations id ("openai/gpt-5.4-nano").
 */
export function buildModelsJson(models: PollinationsModel[]): string {
  const entries = models.map((m) => ({
    id: m.name,
    name: m.title || m.name,
    api: "openai-completions",
    provider: "pollinations",
    baseUrl: `${GEN_ORIGIN}/v1`,
    reasoning: m.reasoning === true,
    input: (m.input_modalities ?? ["text"]).includes("image")
      ? ["text", "image"]
      : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.context_length ?? 128000,
    maxTokens: Math.max(4096, Math.min(Math.floor((m.context_length ?? 128000) / 4), 32768)),
  }));
  return JSON.stringify(
    {
      providers: {
        pollinations: {
          baseUrl: `${GEN_ORIGIN}/v1`,
          api: "openai-completions",
          models: entries,
        },
      },
    },
    null,
    2
  );
}

/** auth.json placed at PI_CODING_AGENT_DIR inside the sandbox. */
export function buildAuthJson(apiKey: string): string {
  return JSON.stringify(
    { pollinations: { type: "api_key", key: apiKey } },
    null,
    2
  );
}

/** ---------- formatting helpers ---------- */

/** Pollen price per 1M tokens, for display. */
export function pollenPerMillion(perToken?: string): string | null {
  const value = Number(perToken);
  if (!Number.isFinite(value) || value <= 0) return null;
  return (value * 1_000_000).toPrecision(2);
}

export function formatPollen(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (amount >= 1) return amount.toFixed(1);
  return amount.toFixed(3);
}
