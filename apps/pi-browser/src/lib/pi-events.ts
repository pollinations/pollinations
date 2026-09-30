/**
 * Reduces `pi --mode json` events into UI turn state.
 *
 * The stream is strict JSONL: one JSON object per LF-terminated line. We
 * reconstruct streaming text/thinking blocks from deltas and attach tool
 * execution results to their tool calls by `toolCallId`.
 */
import type { PiEvent, Turn, TurnBlock } from "./types";

let blockCounter = 0;
function nextBlockId(): string {
  blockCounter += 1;
  return `b${Date.now().toString(36)}-${blockCounter}`;
}

export function createTurn(prompt: string, sessionId: string): Turn {
  return {
    id: nextBlockId(),
    prompt,
    state: "running",
    blocks: [],
    sessionId,
    startedAt: Date.now(),
  };
}

function lastBlock(turn: Turn, kind: TurnBlock["kind"]): TurnBlock | undefined {
  for (let i = turn.blocks.length - 1; i >= 0; i -= 1) {
    if (turn.blocks[i].kind === kind) return turn.blocks[i];
  }
  return undefined;
}

function blockByToolCallId(
  turn: Turn,
  toolCallId: string
): Extract<TurnBlock, { kind: "tool" }> | undefined {
  for (const block of turn.blocks) {
    if (block.kind === "tool" && block.toolCallId === toolCallId) return block;
  }
  return undefined;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function prettyArgs(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

/** Apply one event to the turn (mutates turn state for streaming performance). */
export function applyEvent(turn: Turn, event: PiEvent): void {
  switch (event.type) {
    case "agent_start":
    case "turn_start":
      break;

    case "message_start": {
      const role = event.message?.role;
      if (role !== "assistant") break;
      // A fresh assistant message begins; new blocks will stream in.
      break;
    }

    case "message_update": {
      const inner = event.assistantMessageEvent;
      if (!inner) break;
      switch (inner.type) {
        case "text_start": {
          turn.blocks.push({ kind: "text", id: nextBlockId(), content: "", streaming: true });
          break;
        }
        case "text_delta": {
          const block = lastBlock(turn, "text");
          if (block?.kind === "text") block.content += inner.delta ?? "";
          break;
        }
        case "text_end": {
          const block = lastBlock(turn, "text");
          if (block?.kind === "text") {
            if (inner.content != null) block.content = inner.content;
            block.streaming = false;
          }
          break;
        }
        case "thinking_start": {
          turn.blocks.push({
            kind: "thinking",
            id: nextBlockId(),
            content: "",
            streaming: true,
          });
          break;
        }
        case "thinking_delta": {
          const block = lastBlock(turn, "thinking");
          if (block?.kind === "thinking") block.content += inner.delta ?? "";
          break;
        }
        case "thinking_end": {
          const block = lastBlock(turn, "thinking");
          if (block?.kind === "thinking") {
            if (inner.content != null) block.content = inner.content;
            block.streaming = false;
          }
          break;
        }
        case "toolcall_start": {
          turn.blocks.push({
            kind: "tool",
            id: nextBlockId(),
            toolCallId: inner.id ?? nextBlockId(),
            toolName: inner.toolName ?? "tool",
            args: "",
            argsPretty: "",
            state: "running",
          });
          break;
        }
        case "toolcall_delta": {
          const block = lastBlock(turn, "tool");
          if (block?.kind === "tool") block.args += inner.delta ?? "";
          break;
        }
        case "toolcall_end": {
          const block = lastBlock(turn, "tool");
          if (block?.kind === "tool") {
            const call = inner.toolCall;
            if (call) {
              block.toolCallId = call.id ?? block.toolCallId;
              block.toolName = call.name ?? block.toolName;
              block.args = call.arguments ?? block.args;
            }
            block.argsPretty = prettyArgs(block.args);
          }
          break;
        }
        default:
          break;
      }
      break;
    }

    case "message_end": {
      if (event.message?.role !== "assistant") break;
      // Authoritative final content: mark any trailing streaming blocks done.
      for (const block of turn.blocks) {
        if (block.kind === "text" || block.kind === "thinking") block.streaming = false;
      }
      // Ensure there is at least an empty text block for pure tool-call turns.
      if (!turn.blocks.some((b) => b.kind === "text" || b.kind === "tool" || b.kind === "thinking")) {
        const text = contentToText(event.message.content);
        if (text) turn.blocks.push({ kind: "text", id: nextBlockId(), content: text, streaming: false });
      }
      break;
    }

    case "tool_execution_start": {
      let block = blockByToolCallId(turn, event.toolCallId);
      if (!block) {
        turn.blocks.push({
          kind: "tool",
          id: nextBlockId(),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: JSON.stringify(event.args ?? {}, null, 2),
          argsPretty: JSON.stringify(event.args ?? {}, null, 2),
          state: "running",
        });
        block = turn.blocks[turn.blocks.length - 1] as Extract<TurnBlock, { kind: "tool" }>;
      } else {
        block.state = "running";
        if (event.args) {
          block.argsPretty = JSON.stringify(event.args, null, 2);
        }
      }
      break;
    }

    case "tool_execution_update": {
      const block = blockByToolCallId(turn, event.toolCallId);
      if (block?.kind === "tool") {
        const partial = event.partialResult as { content?: { text?: string }[] } | undefined;
        const text = partial?.content?.map((c) => c.text ?? "").join("");
        if (text) block.output = text;
      }
      break;
    }

    case "tool_execution_end": {
      const block = blockByToolCallId(turn, event.toolCallId);
      if (block?.kind === "tool") {
        block.state = event.isError ? "error" : "done";
        block.isError = event.isError;
        const text = event.result?.content
          ?.map((c) => c.text ?? "")
          .join("")
          .trim();
        if (text) block.output = text;
      }
      break;
    }

    case "turn_end":
      break;

    case "agent_end":
      if (event.willRetry) break; // A retry is scheduled; keep the turn running.
      break;

    case "agent_settled":
      if (turn.state === "running") turn.state = "done";
      turn.endedAt = Date.now();
      break;

    case "auto_retry_start":
      // Surface retries as a transient status; the UI reads turn.errorText.
      turn.errorText = `Retrying after error (attempt ${event.attempt ?? "?"} of ${
        event.maxAttempts ?? "?"
      }): ${event.errorMessage ?? ""}`;
      break;

    case "auto_retry_end":
      if (event.success) turn.errorText = undefined;
      else turn.errorText = event.finalError ?? "The model request failed after retries.";
      break;

    case "compaction_start":
      turn.errorText = `Compacting conversation (${event.reason ?? "threshold"})…`;
      break;

    case "compaction_end":
      turn.errorText = event.errorMessage;
      break;

    case "extension_error":
      turn.errorText = `Extension error (${event.extensionPath ?? "?"}): ${event.error ?? ""}`;
      break;

    default:
      break;
  }
}

/** Parse a chunk of stdout into complete JSONL records (buffered across chunks). */
export class JsonlParser {
  #buffer = "";

  /** Feed raw text; returns the complete records found in it. */
  feed(chunk: string): PiEvent[] {
    this.#buffer += chunk;
    const events: PiEvent[] = [];
    let newlineIndex = this.#buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.#buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      const trimmed = line.trim();
      if (trimmed) {
        try {
          events.push(JSON.parse(trimmed) as PiEvent);
        } catch {
          // Ignore malformed lines — stderr carries diagnostics separately.
        }
      }
      newlineIndex = this.#buffer.indexOf("\n");
    }
    return events;
  }

  /** Flush any trailing record without a newline (pi always ends with LF, but be safe). */
  flush(): PiEvent[] {
    const rest = this.#buffer.trim();
    this.#buffer = "";
    if (!rest) return [];
    try {
      return [JSON.parse(rest) as PiEvent];
    } catch {
      return [];
    }
  }
}
