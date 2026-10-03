/**
 * Shared types for the Pi-in-the-browser app.
 */

/** A Pollinations model as returned by GET https://gen.pollinations.ai/models. */
export interface PollinationsModel {
  /** Full model id, e.g. "openai/gpt-5.4-nano". This exact string is what the API expects. */
  name: string;
  aliases?: string[];
  category?: string;
  publisher?: string;
  title?: string;
  description?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  capabilities?: string[];
  supported_endpoints?: string[];
  tools?: boolean;
  reasoning?: boolean;
  context_length?: number;
  is_specialized?: boolean;
  community?: boolean;
  added_date?: number;
  pricing?: {
    currency?: string;
    promptTextTokens?: string;
    promptCachedTokens?: string;
    completionTextTokens?: string;
  };
  health?: {
    status?: string;
    success_rate?: number;
    requests?: number;
  };
}

/** The connected Pollinations session (BYO Pollen). */
export interface PollenSession {
  /** The user-authorized API key (sk_...). Kept in memory + sessionStorage only. */
  apiKey: string;
  scope?: string;
  /** Unix ms when the key expires, when known. */
  expiresAt?: number;
  /** OIDC userinfo, when the profile scope was granted. */
  user?: {
    sub?: string;
    preferred_username?: string;
    name?: string;
    picture?: string;
    email?: string;
  };
  /** How the key was obtained. */
  source: "oauth" | "manual";
}

export interface PollenBalance {
  balance: number | null;
  accountBalance?: { total?: number; tier?: string; paid?: number };
  fetchedAt: number;
}

/** Sandbox lifecycle. */
export type SandboxPhase =
  | "idle"
  | "loading-sdk"
  | "downloading"
  | "creating"
  | "ready"
  | "error";

export interface LoadProgress {
  phase: "resolving" | "downloading" | "loading" | "ready";
  percent: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  packages: { id: string; cached: boolean; percent: number | null }[];
}

/** A chat turn in the UI. */
export interface Turn {
  id: string;
  /** User prompt that started this turn. */
  prompt: string;
  state: "running" | "done" | "error" | "cancelled";
  /** Ordered blocks rendered inside the turn. */
  blocks: TurnBlock[];
  /** Pi session id used for this run. */
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  errorText?: string;
  /** Raw stderr tail for debugging. */
  stderrTail?: string;
}

export type TurnBlock =
  | { kind: "text"; id: string; content: string; streaming: boolean }
  | { kind: "thinking"; id: string; content: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      toolCallId: string;
      toolName: string;
      args: string;
      argsPretty: string;
      state: "running" | "done" | "error";
      output?: string;
      isError?: boolean;
    };

/** File tree node for the workspace panel. */
export interface FileNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

/** Events emitted by `pi --mode json` (subset we consume). */
export interface PiSessionHeader {
  type: "session";
  version?: number;
  id?: string;
  timestamp?: string;
  cwd?: string;
}

export interface PiMessage {
  role: string;
  content: unknown;
  timestamp?: number;
  stopReason?: string;
}

export interface PiAssistantMessageEvent {
  type:
    | "start"
    | "text_start"
    | "text_delta"
    | "text_end"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_end"
    | "toolcall_start"
    | "toolcall_delta"
    | "toolcall_end"
    | "done"
    | "error";
  contentIndex?: number;
  delta?: string;
  content?: string;
  id?: string;
  toolName?: string;
  toolCall?: { id?: string; name: string; arguments: string };
}

export type PiEvent =
  | PiSessionHeader
  | { type: "agent_start" }
  | { type: "turn_start" }
  | { type: "message_start"; message: PiMessage }
  | {
      type: "message_update";
      usage?: unknown;
      assistantMessageEvent?: PiAssistantMessageEvent;
    }
  | { type: "message_end"; message: PiMessage }
  | {
      type: "turn_end";
      message?: PiMessage;
      toolResults?: unknown[];
    }
  | { type: "agent_end"; messages?: PiMessage[]; willRetry?: boolean }
  | { type: "agent_settled" }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args?: Record<string, unknown>;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      partialResult?: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result?: { content?: { type?: string; text?: string }[] };
      isError?: boolean;
    }
  | { type: "queue_update"; steering?: unknown[]; followUp?: unknown[] }
  | { type: "session_info_changed"; name?: string }
  | { type: "thinking_level_changed"; level?: string }
  | {
      type: "auto_retry_start";
      attempt?: number;
      maxAttempts?: number;
      delayMs?: number;
      errorMessage?: string;
    }
  | { type: "auto_retry_end"; success?: boolean; attempt?: number; finalError?: string }
  | { type: "compaction_start"; reason?: string }
  | { type: "compaction_end"; result?: { summary?: string }; aborted?: boolean; errorMessage?: string }
  | { type: "extension_error"; extensionPath?: string; event?: string; error?: string };
