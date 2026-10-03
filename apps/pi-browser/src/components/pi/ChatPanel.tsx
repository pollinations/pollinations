"use client";

/**
 * The agent chat: user prompts, streaming assistant text/thinking, and live
 * tool-call cards (bash commands, file writes, edits, search) with outputs.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  CircleStop,
  FileEdit,
  FilePlus,
  FileSearch,
  FolderSearch,
  List,
  Loader2,
  Search,
  Send,
  Terminal,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PollinationsModel, Turn, TurnBlock } from "@/lib/types";

interface ChatPanelProps {
  turns: Turn[];
  running: boolean;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  selectedModel: PollinationsModel | null;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  bash: Terminal,
  write: FilePlus,
  edit: FileEdit,
  read: FileSearch,
  grep: Search,
  find: FolderSearch,
  ls: List,
};

function ToolIcon({ name }: { name: string }) {
  const Icon = TOOL_ICONS[name] ?? Terminal;
  return <Icon className="h-3.5 w-3.5" />;
}

/** Short single-line summary of the tool args, for the collapsed card header. */
function summarizeArgs(toolName: string, args: string): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const first = (key: string): string => {
      const value = parsed[key];
      return typeof value === "string" ? value : "";
    };
    switch (toolName) {
      case "bash":
        return first("command");
      case "write":
        return first("path");
      case "edit":
        return first("path");
      case "read":
        return first("path");
      case "grep":
        return first("pattern");
      case "find":
        return first("pattern");
      case "ls":
        return first("path") || "(workspace)";
      default: {
        const values = Object.values(parsed);
        return values.map((v) => String(v)).join(" ").slice(0, 80);
      }
    }
  } catch {
    return args.slice(0, 80);
  }
}

function ThinkingBlock({ block }: { block: Extract<TurnBlock, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-bloom/25 bg-bloom/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <Brain className="h-3.5 w-3.5 text-bloom" aria-hidden />
        <span className="font-medium">
          {block.streaming ? "Thinking…" : "Thought process"}
        </span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <pre className="slim-scroll max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-bloom/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {block.content}
        </pre>
      )}
    </div>
  );
}

function ToolBlock({ block }: { block: Extract<TurnBlock, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeArgs(block.toolName, block.argsPretty || block.args);
  const hasOutput = Boolean(block.output);

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        block.state === "error" ? "border-destructive/50 bg-destructive/5" : "border-border bg-card/50"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            block.state === "running"
              ? "bg-pollen/15 text-pollen"
              : block.state === "error"
                ? "bg-destructive/15 text-destructive"
                : "bg-secondary text-muted-foreground"
          }`}
        >
          {block.state === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ToolIcon name={block.toolName} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <code className="font-mono text-xs font-semibold">{block.toolName}</code>
            {block.state === "running" && (
              <span className="text-[10px] uppercase tracking-wide text-pollen">running</span>
            )}
            {block.state === "error" && (
              <span className="text-[10px] uppercase tracking-wide text-destructive">error</span>
            )}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {summary || "(no arguments)"}
          </span>
        </span>
        {hasOutput && (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>
      {open && (block.argsPretty || block.output) && (
        <div className="border-t border-border/60">
          {block.argsPretty && block.argsPretty !== "{}" && (
            <pre className="slim-scroll max-h-40 overflow-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {block.argsPretty}
            </pre>
          )}
          {block.output && (
            <pre
              className={`slim-scroll max-h-72 overflow-auto whitespace-pre border-t border-border/40 px-3 py-2 font-mono text-[11px] leading-relaxed ${
                block.isError ? "text-destructive" : "text-foreground/85"
              }`}
            >
              {block.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <article className="animate-msg-in space-y-3" aria-label={`Turn: ${turn.prompt.slice(0, 60)}`}>
      {/* user prompt */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-pollen/30 bg-pollen/10 px-4 py-2.5">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{turn.prompt}</p>
        </div>
      </div>

      {/* agent output blocks */}
      {turn.blocks.length > 0 && (
        <div className="space-y-2.5 pl-1 sm:pl-4">
          {turn.blocks.map((block) => {
            if (block.kind === "text") {
              if (!block.content.trim() && !block.streaming) return null;
              return (
                <div key={block.id} className="max-w-full">
                  <p
                    className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90 ${
                      block.streaming ? "stream-cursor" : ""
                    }`}
                  >
                    {block.content}
                  </p>
                </div>
              );
            }
            if (block.kind === "thinking") {
              return <ThinkingBlock key={block.id} block={block} />;
            }
            return <ToolBlock key={block.id} block={block} />;
          })}
        </div>
      )}

      {/* transient status / errors */}
      {turn.state === "running" && turn.blocks.length === 0 && (
        <div className="flex items-center gap-1.5 pl-1 text-muted-foreground sm:pl-4" aria-label="Pi is working">
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-pollen" />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-pollen" />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-pollen" />
          <span className="ml-2 text-xs">Pi is starting up…</span>
        </div>
      )}
      {turn.errorText && turn.state !== "error" && (
        <p className="pl-1 text-xs text-muted-foreground sm:pl-4">{turn.errorText}</p>
      )}
      {turn.state === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs sm:ml-4">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-destructive">Pi run failed</p>
            {turn.errorText && (
              <pre className="slim-scroll mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {turn.errorText}
              </pre>
            )}
          </div>
        </div>
      )}
      {turn.state === "cancelled" && (
        <p className="pl-1 text-xs text-muted-foreground sm:pl-4">Cancelled.</p>
      )}
    </article>
  );
}

const SUGGESTIONS = [
  "Read README.md and summarize the workspace in two sentences.",
  "There's a bug in fib.js — find it, fix it, and prove the fix works.",
  "Add a priority field to the todo list and sort pending() by it.",
  "Create a tiny Node CLI in quote.js that prints a random idea from ideas.md.",
];

export function ChatPanel({ turns, running, onSend, onCancel, selectedModel }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [turns]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottom.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  };

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || running) return;
    stickToBottom.current = true;
    setValue("");
    onSend(prompt);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="slim-scroll min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6"
      >
        {turns.length === 0 ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-5 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pollen/15 text-pollen">
              <User className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Ask Pi anything about this workspace</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Pi runs with <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">read, write, edit, bash, grep, find, ls</code>{" "}
                tools inside the sandbox, using{" "}
                <span className="font-medium text-foreground">
                  {selectedModel?.title ?? "your model"}
                </span>{" "}
                on your Pollen.
              </p>
            </div>
            <div className="grid w-full gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSend(suggestion)}
                  disabled={running}
                  className="rounded-lg border border-border bg-card/50 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-pollen/40 hover:bg-card hover:text-foreground disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </div>

      {/* ---------- composer ---------- */}
      <div className="shrink-0 border-t bg-card/60 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                running ? "Pi is working… (you can cancel)" : "Ask Pi to build, fix, or run something…"
              }
              rows={2}
              disabled={running}
              className="min-h-[52px] resize-none pr-24 text-sm"
              aria-label="Message for Pi"
            />
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
              {running ? (
                <Button size="sm" variant="secondary" onClick={onCancel} className="gap-1.5">
                  <CircleStop className="h-3.5 w-3.5" aria-hidden /> Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={submit}
                  disabled={!value.trim()}
                  className="bg-pollen text-ink hover:bg-pollen/90"
                >
                  <Send className="mr-1 h-3.5 w-3.5" aria-hidden /> Send
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line · files update live on the right
          </p>
        </div>
      </div>
    </div>
  );
}
