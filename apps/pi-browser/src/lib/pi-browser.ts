/**
 * The browser-hosted Pi workspace: loads the vendored Wasmer SDK, downloads
 * the real `wasmer/pi` package from the registry, creates a WASIX sandbox
 * configured for Pollinations, and runs the Pi agent in JSON mode.
 *
 * The Pi agent itself runs inside the page (WebAssembly + Web Workers) — there
 * is no server component. Outbound HTTPS (Pi talking to gen.pollinations.ai)
 * is tunneled through the user's WISP endpoint.
 */
import type {
  Package,
  PackageLoadProgress,
  Process,
  Sandbox,
  Wasmer as WasmerClient,
} from "@wasmer/sdk/browser";
import type { FileNode, LoadProgress, PiEvent } from "./types";
import { JsonlParser, applyEvent, createTurn } from "./pi-events";
import type { Turn } from "./types";

/** The real Pi package from the Wasmer registry, pinned like wasmer.sh. */
export const PI_PACKAGE = "wasmer/pi@=0.87.1";

const VENDOR_SDK_URL = "/vendor/wasmer-sdk/dist/index.js";

type SdkModule = { Wasmer: typeof WasmerClient };
let sdkPromise: Promise<SdkModule> | undefined;

/** Load the vendored SDK with a native dynamic import so worker/wasm URLs resolve untouched. */
export function loadSdk(): Promise<SdkModule> {
  if (!sdkPromise) {
    sdkPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ VENDOR_SDK_URL) as Promise<SdkModule>;
  }
  return sdkPromise;
}

/** Directory entries to hide from the workspace file tree. */
const IGNORED_DIRS = new Set([
  ".pi",
  ".cache",
  ".npm",
  ".local",
  ".python-packages",
  "node_modules",
  "wasix-packages",
]);

export interface StartOptions {
  wispUrl?: string;
  /** Called when the SDK needs a WISP endpoint (missing or failed). Return a URL or throw. */
  requestWispUrl: (request: { url?: string; error?: Error }) => Promise<string>;
  modelsJson: string;
  authJson: string;
  appendSystemMd: string;
  starterFiles: Record<string, string>;
  onProgress?: (progress: LoadProgress) => void;
  signal?: AbortSignal;
}

function toLoadProgress(progress: PackageLoadProgress): LoadProgress {
  return {
    phase: progress.phase,
    percent: progress.download.percent,
    downloadedBytes: progress.download.downloadedBytes,
    totalBytes: progress.download.totalBytes,
    packages: progress.packages.map((p) => ({
      id: p.id,
      cached: p.cached,
      percent: p.download.percent,
    })),
  };
}

/** Extra system-prompt guidance so Pi behaves well inside a browser sandbox. */
export const DEFAULT_APPEND_SYSTEM_MD = `# Browser sandbox environment

You are running inside a WebAssembly (WASIX) sandbox hosted by a web page, on
the user's own machine — there is no remote server. Keep this in mind:

- The workspace is a small in-memory filesystem. Files you create are shown to
  the user in a file tree next to the chat, so keep the project tidy and small.
- Node.js (Edge.js), npm, pnpm, bash, coreutils, fd, ripgrep, grep, sed, and
  find are available. Git is NOT available.
- npm/pnpm installs work but can be slow; prefer writing files directly over
  installing dependencies unless the task requires it.
- Long-running servers never terminate on their own: avoid starting dev
  servers or watchers unless explicitly asked, and kill background processes
  when you are done with them.
- There is no network access to arbitrary hosts beyond package registries and
  the configured model provider; do not attempt to curl random URLs.
- Your bash output and every file you edit are displayed to the user live, so
  prefer a few clear commands over large scripts, and keep outputs concise.
`;

/** A small starter project so there is something to work on immediately. */
export const DEFAULT_STARTER_FILES: Record<string, string> = {
  "README.md": `# Pi sandbox workspace

This folder lives inside a WebAssembly sandbox in your browser. The Pi coding
agent can read, edit, and run these files using your chosen Pollinations model.

Things to try:

- "Add a priority field to the todo list and sort by it."
- "There is a bug in fib.js — find it and fix it, then prove it with a test."
- "Turn this into a tiny CLI and run it with a few examples."

Everything resets when you reload the page.
`,
  "fib.js": `// Fast doubling Fibonacci — but something is off for larger n.
function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

module.exports = { fib };
`,
  "todo.js": `// A tiny in-memory todo list.
class TodoList {
  constructor() {
    this.items = [];
  }

  add(text) {
    this.items.push({ text, done: false, created: Date.now() });
    return this.items.length;
  }

  complete(index) {
    const item = this.items[index];
    if (!item) throw new Error(\`no todo at index \${index}\`);
    item.done = true;
  }

  pending() {
    return this.items.filter((item) => !item.done).map((item) => item.text);
  }
}

module.exports = { TodoList };
`,
  "ideas.md": `# Ideas

- [ ] Ask Pi to write a markdown -> HTML converter in one file
- [ ] Have Pi refactor todo.js into a CLI with commands
- [ ] Let Pi write and run a benchmark comparing two fibonacci implementations
`,
};

export class PiWorkspaceError extends Error {
  constructor(
    message: string,
    public readonly phase: string
  ) {
    super(message);
  }
}

/**
 * Manages the lifecycle of one sandbox session.
 */
export class PiWorkspace {
  #client: WasmerClient | null = null;
  #sandbox: Sandbox | null = null;
  #piPackage: Package | null = null;
  #activeProcess: Process | null = null;
  #onWispRequest: StartOptions["requestWispUrl"] | null = null;
  #disposed = false;

  get ready(): boolean {
    return this.#sandbox != null;
  }

  get sandbox(): Sandbox | null {
    return this.#sandbox;
  }

  /** Load the SDK + Pi package and create the sandbox. */
  async start(options: StartOptions): Promise<void> {
    if (this.#disposed) throw new PiWorkspaceError("Workspace was disposed", "disposed");
    this.#onWispRequest = options.requestWispUrl;

    options.onProgress?.({
      phase: "loading",
      percent: null,
      downloadedBytes: 0,
      totalBytes: null,
      packages: [],
    });

    let sdk: SdkModule;
    try {
      sdk = await loadSdk();
    } catch (error) {
      throw new PiWorkspaceError(
        `Failed to load the Wasmer SDK runtime: ${String(error)}`,
        "sdk"
      );
    }
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const client = new sdk.Wasmer({
      cache: { namespace: "pi-browser" },
      parallelism: 2,
    });
    this.#client = client;
    await client.ready();

    options.onProgress?.({
      phase: "resolving",
      percent: null,
      downloadedBytes: 0,
      totalBytes: null,
      packages: [{ id: PI_PACKAGE, cached: false, percent: null }],
    });

    const [piPackage] = await client.packages.loadMany([PI_PACKAGE], {
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.(toLoadProgress(progress)),
    });
    this.#piPackage = piPackage;

    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const sandbox = await client.sandboxes.create({
      packages: [piPackage],
      env: {
        HOME: "/workspace",
        PI_CODING_AGENT_DIR: "/workspace/.pi",
        PATH: "/bin:/usr/bin",
        USER: "pi",
        LOGNAME: "pi",
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      files: {
        ".pi/models.json": options.modelsJson,
        ".pi/auth.json": options.authJson,
        ".pi/APPEND_SYSTEM.md": options.appendSystemMd,
        ...options.starterFiles,
      },
      network: {
        mode: "wisp",
        url: options.wispUrl,
        requestUrl: async (request) => this.#onWispRequest?.(request) ?? request.url ?? "",
      },
    });
    this.#sandbox = sandbox;
  }

  /** Rewrite .pi/models.json + auth.json (e.g. after switching models). */
  async applyCredentials(modelsJson: string, authJson: string): Promise<void> {
    const sandbox = this.#requireSandbox();
    await sandbox.fs.writeText("/workspace/.pi/models.json", modelsJson);
    await sandbox.fs.writeText("/workspace/.pi/auth.json", authJson);
  }

  /** Update the WISP endpoint of a live sandbox (keeps filesystem + processes). */
  setWispUrl(url: string): void {
    this.#sandbox?.network.setWispUrl(url);
  }

  #requireSandbox(): Sandbox {
    if (!this.#sandbox) {
      throw new PiWorkspaceError("The sandbox is not running", "sandbox");
    }
    return this.#sandbox;
  }

  /**
   * Run one prompt through Pi in JSON mode and stream events into `onEvent`.
   * Returns the final turn state. The process runs to completion (or is
   * cancelled via cancelActiveRun()).
   */
  async runPrompt(params: {
    prompt: string;
    modelId: string;
    sessionId: string;
    tools?: string;
    onEvent: (turn: Turn) => void;
    onStderr?: (chunk: string) => void;
  }): Promise<Turn> {
    const sandbox = this.#requireSandbox();
    const turn = createTurn(params.prompt, params.sessionId);
    const parser = new JsonlParser();
    let stderrTail = "";

    const args = [
      "--mode",
      "json",
      "--offline",
      "--provider",
      "pollinations",
      "--model",
      params.modelId,
      "--tools",
      params.tools ?? "read,write,edit,bash,grep,find,ls",
      "--session-id",
      params.sessionId,
      "--",
      params.prompt,
    ];

    const command = sandbox.command(
      this.#piPackage ?? "pi",
      args,
      { cwd: "/workspace" }
    );
    const process = await command.spawn({
      stdin: "closed",
      stdout: "pipe",
      stderr: "pipe",
      outputBytes: 8 * 1024 * 1024,
    });
    this.#activeProcess = process;
    params.onEvent({ ...turn, blocks: [...turn.blocks] });

    const emit = () => params.onEvent({ ...turn, blocks: turn.blocks.map((b) => ({ ...b })) });

    try {
      const decoder = new TextDecoder();
      if (process.stdout) {
        for await (const chunk of process.stdout) {
          for (const event of parser.feed(decoder.decode(chunk, { stream: true }))) {
            applyEvent(turn, event);
            emit();
          }
        }
        for (const event of parser.flush()) {
          applyEvent(turn, event);
          emit();
        }
      }
      if (process.stderr) {
        for await (const chunk of process.stderr) {
          stderrTail = (stderrTail + decoder.decode(chunk, { stream: true })).slice(-4000);
          params.onStderr?.(stderrTail);
        }
      }
      const output = await process.wait({ check: false });
      if (turn.state === "running") {
        if (output.ok) {
          turn.state = "done";
        } else if (output.reason === "terminated") {
          turn.state = "cancelled";
        } else {
          turn.state = "error";
          const stderrText = output.stderr.text().trim();
          turn.errorText =
            stderrTail.trim() || stderrText || `pi exited with status ${output.exitCode}`;
        }
        turn.endedAt = Date.now();
        emit();
      }
    } finally {
      this.#activeProcess = null;
    }
    return turn;
  }

  /** Kill the in-flight pi run (if any). The turn resolves as "cancelled". */
  async cancelActiveRun(): Promise<void> {
    const process = this.#activeProcess;
    if (!process) return;
    try {
      await process.kill();
    } catch {
      /* already dead */
    }
  }

  /** Recursively list workspace files (bounded), skipping internals. */
  async listWorkspaceFiles(maxFiles = 400): Promise<FileNode[]> {
    const sandbox = this.#requireSandbox();
    const root: FileNode = { name: "workspace", path: "", kind: "directory", children: [] };
    let count = 0;

    const walk = async (dirPath: string, into: FileNode, depth: number): Promise<void> => {
      if (count >= maxFiles || depth > 6) return;
      let entries;
      try {
        entries = await sandbox.fs.readDir(`/workspace${dirPath}`);
      } catch {
        return;
      }
      // Stable order: directories first, then files, alphabetical.
      const sorted = [...entries].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of sorted) {
        if (count >= maxFiles) return;
        const path = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          if (IGNORED_DIRS.has(entry.name) && depth === 0) continue;
          if (entry.name === "node_modules") continue;
          const node: FileNode = { name: entry.name, path, kind: "directory", children: [] };
          into.children!.push(node);
          count += 1;
          await walk(path, node, depth + 1);
        } else {
          into.children!.push({ name: entry.name, path, kind: "file", size: entry.size });
          count += 1;
        }
      }
    };

    await walk("", root, 0);
    return root.children ?? [];
  }

  async readWorkspaceFile(path: string): Promise<string> {
    const sandbox = this.#requireSandbox();
    return sandbox.fs.readText(`/workspace/${path.replace(/^\/+/, "")}`);
  }

  async writeWorkspaceFile(path: string, contents: string): Promise<void> {
    const sandbox = this.#requireSandbox();
    await sandbox.fs.writeText(`/workspace/${path.replace(/^\/+/, "")}`, contents);
  }

  /** Tear down the sandbox (filesystem is discarded). */
  async dispose(): Promise<void> {
    this.#disposed = true;
    try {
      await this.cancelActiveRun();
    } catch {
      /* ignore */
    }
    try {
      await this.#sandbox?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.#client?.close();
    } catch {
      /* ignore */
    }
    this.#sandbox = null;
    this.#client = null;
    this.#piPackage = null;
  }
}

/** Generate a pi-compatible session id (letters, numbers, ., _, -). */
export function newSessionId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(rand, (b) => b.toString(36).padStart(2, "0")).join("");
  return `web-${Date.now().toString(36)}-${suffix}`;
}
