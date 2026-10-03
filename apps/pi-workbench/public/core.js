export const API = "https://gen.pollinations.ai";
export const DEFAULT_MODEL = "openai/gpt-5.4-nano";
export function projectPath(value) {
    const path = value.trim();
    if (
        !path ||
        path.startsWith("/") ||
        path.includes("\\") ||
        [".pi", ".bridge"].includes(path.split("/")[0]) ||
        path.split("/").some((part) => !part || part === ".." || part === ".")
    )
        throw new Error(
            "Use a project path such as src/hello.js; parent paths and .pi/.bridge runtime folders are reserved.",
        );
    return path;
}
export function authorizeRequest(request, { model, mode, exa, computer }) {
    const url = new URL(request.url);
    if (
        url.origin !== API ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        request.method !== "POST"
    )
        throw new Error(
            "The sandbox can only call enabled Pollinations tools.",
        );
    const body = JSON.parse(request.body);
    if (url.pathname === "/v1/chat/completions") {
        if (
            typeof body.model !== "string" ||
            !body.model ||
            (mode !== "terminal" && body.model !== model)
        )
            throw new Error("The requested model is not the selected model.");
        body.stream = true;
        body.stream_options = { include_usage: true };
        return { url: url.href, body, kind: "model" };
    }
    const tools =
        url.pathname === "/mcp/exa" && exa
            ? ["web_search_exa", "web_fetch_exa"]
            : url.pathname === "/mcp/computer" && computer
              ? ["bash"]
              : [];
    if (
        body.jsonrpc !== "2.0" ||
        body.method !== "tools/call" ||
        !tools.includes(body.params?.name)
    )
        throw new Error("This MCP tool is disabled or not supported.");
    return { url: url.href, body, kind: body.params.name };
}
export function streamReceipt(body) {
    let usage;
    let id;
    for (const line of body.split("\n")) {
        if (!line.startsWith("data: ") || line.slice(6).trim() === "[DONE]")
            continue;
        const chunk = JSON.parse(line.slice(6));
        if (chunk.id) id = chunk.id;
        if (chunk.usage) usage = chunk.usage;
    }
    if (
        !usage ||
        !Number.isFinite(usage.prompt_tokens) ||
        !Number.isFinite(usage.completion_tokens)
    )
        throw new Error(
            "The provider returned no terminal usage; the run stopped.",
        );
    return { responseId: id, usage };
}
export function mcpResult(body, type) {
    const response = type.includes("text/event-stream")
        ? body
              .split("\n")
              .filter((line) => line.startsWith("data: "))
              .map((line) => JSON.parse(line.slice(6)))
              .find((item) => "result" in item || "error" in item)
        : JSON.parse(body);
    if (!response || response.error || response.result?.isError)
        throw new Error(response?.error?.message || "MCP tool failed.");
    return response.result;
}
