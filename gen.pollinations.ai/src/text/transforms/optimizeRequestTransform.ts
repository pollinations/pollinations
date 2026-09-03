import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Request optimization transform.
 *
 * Condenses the system prompt, removes duplicate/empty messages, strips
 * repeated reasoning blocks, collapses whitespace, trims stale turns, and
 * condenses verbose tool descriptions — all to reduce the token budget
 * consumed by boilerplate before the request reaches the upstream provider.
 *
 * This is a TypeScript port of the Python `optimize_request` logic, adapted
 * to the Pollinations transform pipeline. It mutates messages in-place
 * (returning the same array reference) and returns a new options object
 * with the filtered tools.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 40;
const TOOL_RESULT_CAP = 4000;
const OLD_TOOL_RESULT_CAP = 1200;

// ── System prompt condensation ───────────────────────────────────────────────

const SEARCH_VSC = new RegExp(
    "Follow the user's requirements carefully & to the letter\\.\\n" +
        "Follow Microsoft content policies\\.\\n" +
        "[\\s\\S]*? simple code examples or demonstrations; debugging </description>",
    "i",
);

const REPLACE_VSC =
    "### Core Rules\n" +
    "- Follow user requirements strictly and to the letter.\n" +
    "- Keep answers short and impersonal.\n\n" +
    "### Role & Context\n" +
    "You are an expert automated coding agent.\n" +
    "- **Gather context first:** Don't make assumptions. Use tools to read files " +
    "and understand the workspace before acting. Don't give up if a task seems " +
    "hard; explore creatively to find a solution.\n" +
    "- **Be efficient:** Read large file chunks to minimize tool calls. Use " +
    "provided context/attachments if relevant. Don't re-read files already in " +
    "context.\n" +
    "- **Infer project type:** Use languages, frameworks, and libraries inferred " +
    "from the context to guide your changes.\n\n" +
    "### Tool Usage\n" +
    "- **Direct answers:** Answer direct code sample requests without using " +
    "tools.\n" +
    "- **Schema & permissions:** Follow JSON schemas strictly. Include ALL " +
    "required properties. No need to ask permission before using a tool.\n" +
    "- **Parallelization:** Call independent tools in parallel. Run terminal " +
    "commands sequentially (never in parallel).\n" +
    "- **Transparency:** Never mention tool names to the user (e.g., say \"I'll " +
    'run the command" not "I\'ll use run_in_terminal").\n' +
    "- **Best practices:** Use absolute paths/URIs. Use `grep_search` for file " +
    "overviews. Use browser tools for front-end UI validation. Only use " +
    "currently available tools.\n" +
    "- **Continuity:** Don't repeat yourself after a tool call; pick up where " +
    "you left off.\n\n" +
    "### Editing & Execution\n" +
    "- **No codeblocks:** NEVER print codeblocks for file changes or terminal " +
    "commands. Use the respective tools directly.\n" +
    "- **Read before edit:** Ensure a file is in context before editing. Use " +
    "`replace_string_in_file` (preferred) or `insert_edit_into_file`. Group " +
    "changes by file. Never pass omitted line markers (e.g., `/* Lines 123-456 " +
    "omitted */`) to edit tools.\n" +
    "- **Insert edits:** For `insert_edit_into_file`, use `// ...existing " +
    "code...` comments to omit unchanged code. Be as concise as possible.\n" +
    "- **No terminal edits:** Never edit files via terminal commands unless " +
    "explicitly asked.\n" +
    "- **Dependencies & UI:** Use popular external libraries when appropriate " +
    "(install via `npm install`, etc.). Build modern, beautiful UIs from " +
    "scratch.\n" +
    "- **Error fixing:** Fix new errors resulting from your edits. Max 3 " +
    "attempts per file; if the third fails, stop and ask the user.\n\n" +
    "### Notebooks\n" +
    "- Use `edit_notebook_file` and `run_notebook_cell` for notebooks. NEVER " +
    "use terminal commands or `insert_edit_into_file` for notebooks.\n" +
    "- Use `copilot_getNotebookSummary` for overviews. Refer to cells by " +
    "number, not ID. Markdown cells cannot be executed.\n\n" +
    "### Output Formatting\n" +
    "- Use Markdown. Wrap filenames/symbols in backticks (e.g., " +
    "`src/models/person.ts`).\n" +
    "- Use `$` for inline math and `$$` for block math (KaTeX).\n" +
    "- Use ```mermaid fenced code blocks for Mermaid diagrams.\n\n" +
    "### Memory\n" +
    "Consult memory files for past insights. Keep entries concise and update " +
    "existing files over creating new ones.\n" +
    "- **User (`/memories/`):** Persistent, auto-loaded. Store preferences and " +
    "general insights.\n" +
    "- **Session (`/memories/session/`):** Current conversation only. Store " +
    "task-specific state.\n" +
    "- **Repository (`/memories/repo/`):** Local workspace facts, conventions, " +
    "and build commands.\n\n" +
    "### Workspace & Skills\n" +
    "- This is a multi-root workspace. Apply folder-specific instructions to " +
    "their respective folders.\n" +
    "- **Skills:** Use `read_file` to load detailed skill instructions when a " +
    "task matches a skill's domain (e.g., use `project-setup-info-local` for " +
    "scaffolding new projects from scratch, not for adding individual files).";

function optimizeSystemMessage(messages: ChatMessage[]): number {
    if (!messages.length) return 0;
    const first = messages[0];
    if (!first || first.role !== "system") return 0;
    const content = first.content;
    if (typeof content !== "string") return 0;
    const newContent = content.replace(SEARCH_VSC, REPLACE_VSC);
    if (newContent === content) return 0;
    const saved = content.length - newContent.length;
    first.content = newContent;
    return saved;
}

// ── Message helpers ──────────────────────────────────────────────────────────

function msgBytes(msg: ChatMessage | undefined): number {
    if (!msg) return 0;
    const content = msg.content;
    if (typeof content === "string") return content.length;
    if (Array.isArray(content)) {
        let total = 0;
        for (const part of content) {
            if (part && typeof part === "object" && "text" in part) {
                const text = (part as Record<string, unknown>).text;
                if (typeof text === "string") total += text.length;
            }
        }
        return total;
    }
    return 0;
}

function isEmptyContent(msg: ChatMessage): boolean {
    const content = msg.content;
    if (content === null || content === undefined) return true;
    if (typeof content === "string") return !content.trim();
    if (Array.isArray(content)) {
        for (const part of content) {
            if (part && typeof part === "object" && "text" in part) {
                const text = (part as Record<string, unknown>).text;
                if (typeof text === "string" && text.trim()) return false;
            }
        }
        return true;
    }
    return false;
}

function msgSignature(msg: ChatMessage): string {
    const role = msg.role || "";
    const content = msg.content;
    if (typeof content === "string") return `${role}:${content}`;
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const part of content) {
            if (part && typeof part === "object" && "text" in part) {
                const text = (part as Record<string, unknown>).text;
                if (typeof text === "string") parts.push(text);
            }
        }
        return `${role}:${parts.join("\n")}`;
    }
    return role;
}

// ── Message dedup ────────────────────────────────────────────────────────────

function dedupMessages(messages: ChatMessage[]): {
    result: ChatMessage[];
    saved: number;
} {
    const originalBytes = messages.reduce((sum, m) => sum + msgBytes(m), 0);
    const seen = new Set<string>();
    const result: ChatMessage[] = [];

    for (const msg of messages) {
        const role = msg.role || "";

        // Always keep system messages.
        if (role === "system") {
            result.push(msg);
            continue;
        }

        // Drop empty messages, but keep assistant messages with tool_calls.
        if (isEmptyContent(msg) && !msg.tool_calls) continue;

        // Collapse consecutive same-role messages.
        const prev = result[result.length - 1];
        if (prev && prev.role === role) {
            if (msg.tool_calls && !prev.tool_calls) {
                result.pop();
                result.push(msg);
                continue;
            }
            if (prev.tool_calls && !msg.tool_calls) continue;
            continue; // Neither has tool_calls — skip duplicate.
        }

        // Remove exact duplicates.
        const sig = msgSignature(msg);
        if (sig !== role && seen.has(sig)) continue;
        seen.add(sig);

        result.push(msg);
    }

    const newBytes = result.reduce((sum, m) => sum + msgBytes(m), 0);
    return { result, saved: Math.max(0, originalBytes - newBytes) };
}

// ── Reasoning echo removal ───────────────────────────────────────────────────

const THINK_RE = /<think>[\s\S]*?<\/think>/gi;
const REASONING_TAG_RE = /<reasoning[\s\S]*?<\/reasoning>/gi;

function stripReasoningEcho(messages: ChatMessage[]): number {
    let saved = 0;
    let seenThink = false;
    let seenReasoning = false;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || msg.role !== "assistant") continue;
        const content = msg.content;
        if (typeof content !== "string") continue;

        let newContent = content;

        if (THINK_RE.test(newContent)) {
            if (seenThink) {
                const before = newContent.length;
                newContent = newContent.replace(THINK_RE, "");
                saved += before - newContent.length;
            } else {
                seenThink = true;
            }
        }
        // Reset lastIndex after .test() side effects.
        THINK_RE.lastIndex = 0;

        if (REASONING_TAG_RE.test(newContent)) {
            if (seenReasoning) {
                const before = newContent.length;
                newContent = newContent.replace(REASONING_TAG_RE, "");
                saved += before - newContent.length;
            } else {
                seenReasoning = true;
            }
        }
        REASONING_TAG_RE.lastIndex = 0;

        if (newContent !== content) {
            newContent = newContent.replace(/\n{3,}/g, "\n\n").trim();
            if (!newContent) {
                saved += content.length;
                messages[i] = { role: "assistant", content: "" };
            } else {
                msg.content = newContent;
            }
        }
    }

    return Math.max(0, saved);
}

// ── Whitespace collapse ──────────────────────────────────────────────────────

const WS_RE = /[ \t]+\n/g;
const BLANK_RUN_RE = /\n{3,}/g;

function collapseWhitespace(messages: ChatMessage[]): number {
    let saved = 0;
    for (const msg of messages) {
        const content = msg.content;
        if (typeof content === "string" && content.length > 64) {
            const newContent = content
                .replace(WS_RE, "\n")
                .replace(BLANK_RUN_RE, "\n\n");
            if (newContent !== content) {
                saved += content.length - newContent.length;
                msg.content = newContent;
            }
        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (part && typeof part === "object" && "text" in part) {
                    const text = (part as Record<string, unknown>).text;
                    if (typeof text === "string" && text.length > 64) {
                        const newText = text
                            .replace(WS_RE, "\n")
                            .replace(BLANK_RUN_RE, "\n\n");
                        if (newText !== text) {
                            saved += text.length - newText.length;
                            (part as Record<string, unknown>).text = newText;
                        }
                    }
                }
            }
        }
    }
    return Math.max(0, saved);
}

// ── Trim old turns ───────────────────────────────────────────────────────────

function trimOldTurns(messages: ChatMessage[]): number {
    if (messages.length <= MAX_TURNS + 1) return 0;

    const systemMsgs: ChatMessage[] = [];
    const rest: ChatMessage[] = [];
    for (const m of messages) {
        if (m.role === "system") systemMsgs.push(m);
        else rest.push(m);
    }

    if (rest.length <= MAX_TURNS) return 0;

    const dropped = rest.slice(0, rest.length - MAX_TURNS);
    const kept = rest.slice(rest.length - MAX_TURNS);
    const saved = dropped.reduce((sum, m) => sum + msgBytes(m), 0);

    messages.splice(0, messages.length, ...systemMsgs, ...kept);
    return Math.max(0, saved);
}

// ── Tool result truncation ───────────────────────────────────────────────────

function truncateToolResults(messages: ChatMessage[]): number {
    let saved = 0;

    // Collect tool-role indices, newest first.
    const toolIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
        if (messages[i]?.role === "tool") toolIndices.push(i);
    }
    toolIndices.reverse();

    for (let age = 0; age < toolIndices.length; age++) {
        const idx = toolIndices[age];
        const msg = messages[idx];
        if (!msg) continue;
        const cap = age >= 2 ? OLD_TOOL_RESULT_CAP : TOOL_RESULT_CAP;
        const content = msg.content;
        if (typeof content !== "string") continue;
        if (content.length <= cap) continue;

        const before = content.length;
        const head = Math.floor(cap / 2);
        const tail = Math.floor(cap / 4);
        const newContent =
            content.slice(0, head) +
            `\n... [${before - head - tail} chars truncated] ...\n` +
            content.slice(-tail);
        msg.content = newContent;
        saved += before - newContent.length;
    }

    return Math.max(0, saved);
}

// ── Tool description condensing ──────────────────────────────────────────────

interface ToolReplacement {
    pattern: RegExp;
    replacement: string;
}

const TOOL_REPLACEMENTS: ToolReplacement[] = [
    // Remove excessive ALL-CAPS emphasis.
    { pattern: /\bIMPORTANT:\s*/g, replacement: "" },
    { pattern: /\bCRITICAL:?\s*/g, replacement: "" },
    { pattern: /\bWARNING:\s*/g, replacement: "Note: " },
    { pattern: /\bNEVER\b/g, replacement: "Do not" },
    { pattern: /\bMUST\b/g, replacement: "should" },
    // Remove redundant "When NOT to use" boilerplate.
    {
        pattern:
            /When NOT to use this tool: creating single files or small code snippets; adding individual files to existing projects; making modifications to existing codebases; user asks to "create a file" or "add a component"; simple code examples or demonstrations; debugging/gi,
        replacement: "",
    },
    // Trim verbose run_in_terminal description.
    {
        pattern:
            /This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands\./gi,
        replacement:
            "Execute shell commands in a persistent terminal. State (env vars, cwd) is preserved across calls.",
    },
    {
        pattern:
            /For ALL one-shot commands \(builds, tests, installs, compilation, linting, downloads, scripts\), use mode='sync' and omit timeout\. The tool waits for the command to complete and returns full output inline\. This is the default and strongly preferred mode\./gi,
        replacement:
            "Use mode='sync' (default) for all one-shot commands. Output is returned inline.",
    },
    {
        pattern:
            /Use mode='async' ONLY for processes that must keep running indefinitely while you do other work \(servers, watchers, dev daemons\)\. Async waits for an initial idle\/output signal, then returns a terminal ID and output snapshot while the process continues running\./gi,
        replacement:
            "Use mode='async' only for long-running processes (servers, watchers, daemons). Returns a terminal ID for later use.",
    },
    {
        pattern:
            /In sync mode, the full output is returned when the command completes — you do NOT need to call get_terminal_output afterward\. Only use get_terminal_output if the tool result explicitly says the command was moved to background, timed out, or needs input\./gi,
        replacement:
            "In sync mode, output is returned inline. Only use get_terminal_output if the result indicates the command was moved to background or needs input.",
    },
    {
        pattern:
            /Sync output is final: When a sync command completes, the full output is returned inline — do NOT call get_terminal_output afterward\. Only use get_terminal_output if the tool result explicitly indicates the command was moved to background, timed out, or needs input\. Do NOT tell the user to check the terminal panel — all command output is already included in the tool result\./gi,
        replacement: "Sync output is final and returned inline.",
    },
    {
        pattern:
            /Terminal notifications: When an async command finishes or a sync command times out, you will be automatically notified on your next turn with the exit code and terminal output\. You will also be notified if the terminal needs input\. Do NOT poll or sleep to wait for completion\./gi,
        replacement:
            "For async/timeout commands, you'll be auto-notified on completion. Do not poll.",
    },
    {
        pattern:
            /NEVER run sleep or similar wait commands in a terminal\. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input\. Do NOT poll for completion\.\n-/gi,
        replacement:
            "Do not run sleep or wait commands. You'll be auto-notified on completion.\n-",
    },
    {
        pattern:
            /NEVER pipe interactive commands through tail, head, grep, or other filters — this hides prompts and prevents the terminal from detecting when input is needed\. Run interactive commands without pipes\.\n\n/gi,
        replacement:
            "Do not pipe interactive commands through filters — this hides prompts.\n\n",
    },
    {
        pattern:
            /When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed\. Instead, use the vscode_askQuestions tool to collect the needed values from the user, then send them\./gi,
        replacement:
            "For interactive input prompts, use vscode_askQuestions to collect values from the user.",
    },
    {
        pattern:
            /Send exactly one answer per prompt using send_to_terminal\. Never send multiple answers in a single send\./gi,
        replacement: "Send one answer per prompt.",
    },
    {
        pattern:
            /After each send, call get_terminal_output to read the next prompt before sending the next answer\./gi,
        replacement:
            "After sending, call get_terminal_output to read the next prompt.",
    },
    {
        pattern: /Continue one prompt at a time until the command finishes\./gi,
        replacement: "",
    },
    {
        pattern: /Use \[\[ \]\] for conditional tests instead of \[ \]/g,
        replacement: "Use [[ ]] for conditionals",
    },
    {
        pattern: /Prefer \$\(\) over backticks for command substitution/g,
        replacement: "Prefer $() over backticks",
    },
    {
        pattern: /Use which or command -v to verify command availability/g,
        replacement: "Use `which` to verify command availability.",
    },
    // Fix insert_edit_into_file verbose example.
    {
        pattern:
            /The system is very smart and can understand how to apply your edits to the notebooks\.\n/gi,
        replacement:
            "Provide minimal hints — the system applies edits intelligently.",
    },
    // Fix replace_string_in_file verbose warnings.
    {
        pattern:
            /CRITICAL for \\?`oldString\\?`: Must uniquely identify the single instance to change\. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely\. If this string matches multiple locations, or does not match exactly, the tool will fail\. Never use 'Lines 123-456 omitted' from summarized documents or \.\.\.existing code\.\.\. comments in the oldString or newString\./gi,
        replacement:
            "oldString must uniquely identify one location. Include 3+ lines of surrounding context.",
    },
    // Fix manage_todo_list verbose CRITICAL workflow.
    {
        pattern:
            /CRITICAL workflow:\s*\n1\. Plan tasks by writing todo list with specific, actionable items\s*\n2\. Mark ONE todo as in-progress before starting work\s*\n3\. Complete the work for that specific todo\s*\n4\. Mark that todo as completed IMMEDIATELY\s*\n5\. Move to next todo and repeat/gi,
        replacement:
            "Workflow: write todos → mark one as in-progress → complete it → mark completed → repeat.",
    },
    // Fix open_browser_page verbose note.
    {
        pattern:
            /May prompt the user to share a page if there is a similar one already open, unless "forceNew" is true\./gi,
        replacement:
            "Set forceNew=true to force a new page; otherwise reuses existing pages.",
    },
    // Fix runSubagent verbose preamble.
    {
        pattern:
            /This tool is good at researching complex questions, searching for code, and executing multi-step tasks\. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you\./gi,
        replacement:
            "Use for complex multi-step research, code search, or tasks that may need multiple attempts.",
    },
    {
        pattern:
            /Agents do not run async or in the background, you will wait for the agent's result\./gi,
        replacement: "Agents run synchronously — wait for results.",
    },
    {
        pattern:
            /When the agent is done, it will return a single message back to you\. The result returned by the agent is not visible to the user\. To show the user the result, you should send a text message back to the user with a concise summary of the result\./gi,
        replacement:
            "Agent results aren't shown to users — summarize results in your reply.",
    },
    {
        pattern:
            /Each agent invocation is stateless\. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report\. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you\./gi,
        replacement:
            "Agents are stateless. Provide a detailed, self-contained prompt specifying what to return.",
    },
    {
        pattern: /The agent's outputs should generally be trusted\n/gi,
        replacement: "",
    },
    {
        pattern:
            /Clearly tell the agent whether you expect it to write code or just to do research \(search, file reads, web fetches, etc\.\), since it is not aware of the user's intent\n/gi,
        replacement:
            "Specify whether the agent should write code or only research.",
    },
    {
        pattern:
            /- If the user asks for a certain agent, you MUST provide that EXACT agent name \(case-sensitive\) to invoke that specific agent\./gi,
        replacement: "Use exact agent names (case-sensitive) when specified.",
    },
    // Fix vscode_askQuestions verbose parameter docs.
    {
        pattern:
            /Users can always provide a freeform text answer alongside options unless you set allowFreeformInput to false\./gi,
        replacement: "",
    },
    // Fix configure_python_environment verbose ALL-CAPS.
    {
        pattern:
            /ALWAYS Use this tool to set up the user's chosen environment and ALWAYS call this tool before using any other Python related tools or running any Python command in the terminal\./gi,
        replacement: "Call this before any other Python tool or command.",
    },
    // Fix get_terminal_output verbose preamble.
    {
        pattern:
            /Get output from a terminal execution that was moved to background \(identified by the `id` returned from run_in_terminal\)\. Use this ONLY when the run_in_terminal result explicitly says the command was moved to background, timed out, or needs input\. Do NOT call this after a sync command that completed normally — sync commands return full output inline\. If a background command has not yet completed, you will be automatically notified when it finishes — do NOT poll; end your turn and wait\./gi,
        replacement:
            "Get output from a backgrounded/timed-out terminal. Don't call after successful sync commands. For pending commands, wait for auto-notification.",
    },
    // Fix memory tool verbose preamble.
    {
        pattern:
            /IMPORTANT: Before creating new memory files, first view the \/memories\/ directory to understand what already exists\. This helps avoid duplicates and maintain organized notes\./gi,
        replacement:
            "Check existing files in /memories/ before creating new ones.",
    },
    // Fix create_new_workspace verbose When NOT to use.
    {
        pattern:
            /When NOT to use this tool:\n- Creating single files or small code snippets\n- Adding individual files to existing projects\n- Making modifications to existing codebases\n- User asks to "create a file" or "add a component"\n- Simple code examples or demonstrations\n- Debugging or fixing existing code/gi,
        replacement: "",
    },
    // Remove standalone "Do NOT" lines that restate earlier rules.
    {
        pattern:
            /Do NOT tell the user to check the terminal panel — all command output is already included in the tool result\./gi,
        replacement: "",
    },
    // Fix create_file description.
    {
        pattern:
            /This is a tool for creating a new file in the workspace\. The file will be created with the specified content\. The directory will be created if it does not already exist\. Never use this tool to edit a file that already exists\./gi,
        replacement:
            "Create a new file. Directories are auto-created. Do not use for editing existing files.",
    },
    // Fix read_file description.
    {
        pattern:
            /You must specify the line range you're interested in\. Line numbers are 1-indexed\. If the file contents returned are insufficient for your task, you may call this tool again to retrieve more content\. Prefer reading larger ranges over doing many small reads\. Binary files use startLine\/endLine as byte offsets\./gi,
        replacement:
            "Specify 1-indexed line ranges. Prefer larger reads over many small ones. For binary files, ranges are byte offsets.",
    },
    // Fix grep_search verbose preamble.
    {
        pattern:
            /Do a fast text search in the workspace\. Use this tool when you want to search with an exact string or regex\. If you are not sure what words will appear in the workspace, prefer using regex patterns with alternation \(\|\) or character classes to search for multiple potential words at once instead of making separate searches\. For example, use 'function\|method\|procedure' to look for all of those words at once\. Use includePattern to search within files matching a specific pattern, or in a specific file, using a relative path\. Use 'includeIgnoredFiles' to include files normally ignored by \.gitignore, other ignore files, and `files\.exclude` and `search\.exclude` settings\. Warning: using this may cause the search to be slower, only set it when you want to search in ignored folders like node_modules or build outputs\. Use this tool when you want to see an overview of a particular file, instead of using read_file many times to look for code within a file\./gi,
        replacement:
            "Fast text/regex search across workspace files. Use regex alternation (e.g. 'word1|word2') for broad searches. Use includePattern to scope to specific files. Set includeIgnoredFiles=true to search node_modules/build outputs (slower).",
    },
    // Fix file_search verbose examples.
    {
        pattern:
            /Search for files in the workspace by glob pattern\. This only returns the paths of matching files\. Use this tool when you know the exact filename pattern of the files you're searching for\. Glob patterns match from the root of the workspace folder\. Examples:\s*\n\s*- \*\*\/\*\.\{js,ts\} to match all js\/ts files in the workspace\.\s*\n\s*- src\/\*\* to match all files under the top-level src folder\.\s*\n\s*- \*\*\/foo\/\*\*\/\*\.js to match all js files under any foo folder in the workspace\.\s*\n\s*In a multi-root workspace, you can scope the search to a specific workspace folder by using the absolute path to the folder as the query, e\.g\. \/path\/to\/folder\/\*\*\/\*\.ts\./gi,
        replacement:
            "Find files by glob pattern (e.g. '**/*.ts', 'src/**'). Returns matching paths only.",
    },
];

function toolDescription(tool: unknown): string {
    if (!tool || typeof tool !== "object") return "";
    const fn = (tool as Record<string, unknown>).function;
    if (fn && typeof fn === "object") {
        return ((fn as Record<string, unknown>).description as string) || "";
    }
    return ((tool as Record<string, unknown>).description as string) || "";
}

function setToolDescription(tool: unknown, desc: string): void {
    if (!tool || typeof tool !== "object") return;
    const fn = (tool as Record<string, unknown>).function;
    if (fn && typeof fn === "object") {
        (fn as Record<string, unknown>).description = desc;
    } else {
        (tool as Record<string, unknown>).description = desc;
    }
}

function optimizeTools(tools: unknown[]): {
    filtered: unknown[];
    saved: number;
} {
    if (!tools.length) return { filtered: tools, saved: 0 };

    const startLen = JSON.stringify(tools).length;

    // Condense descriptions.
    for (const tool of tools) {
        let desc = toolDescription(tool);
        if (!desc) continue;
        for (const { pattern, replacement } of TOOL_REPLACEMENTS) {
            if (pattern.test(desc)) {
                desc = desc.replace(pattern, replacement);
            }
            pattern.lastIndex = 0;
        }
        // Collapse whitespace artifacts.
        desc = desc.replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n");
        setToolDescription(tool, desc);
    }

    const endLen = JSON.stringify(tools).length;
    return { filtered: tools, saved: Math.max(0, startLen - endLen) };
}

// ── Main transform ───────────────────────────────────────────────────────────

export const optimizeRequestTransform: TransformFn = (
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult => {
    // System prompt condensation.
    const systemSaved = optimizeSystemMessage(messages);

    // Message dedup (returns a new array).
    const { result: deduped, saved: dedupSaved } = dedupMessages(messages);
    messages.splice(0, messages.length, ...deduped);

    // Reasoning echo removal.
    const reasoningSaved = stripReasoningEcho(messages);

    // Whitespace collapse.
    const wsSaved = collapseWhitespace(messages);

    // Only truncate tool results and trim old turns when the system prompt
    // was actually condensed — i.e. this is a verbose Copilot-style request.
    let toolResultSaved = 0;
    let turnSaved = 0;
    if (systemSaved > 0) {
        toolResultSaved = truncateToolResults(messages);
        turnSaved = trimOldTurns(messages);
    }

    // Tool description condensing.
    let updatedOptions = options;
    let toolDescSaved = 0;
    if (Array.isArray(options.tools) && options.tools.length > 0) {
        const { filtered, saved } = optimizeTools(options.tools as unknown[]);
        if (saved > 0) {
            updatedOptions = { ...options, tools: filtered };
            toolDescSaved = saved;
        }
    }

    const totalSaved =
        systemSaved +
        dedupSaved +
        reasoningSaved +
        wsSaved +
        toolResultSaved +
        turnSaved +
        toolDescSaved;

    return { messages, options: updatedOptions, saved: totalSaved };
};
