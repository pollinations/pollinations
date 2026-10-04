import {
    type McpCall,
    parseFunctionName,
} from "@shared/agents/function-items.ts";
import {
    mcpErrorText,
    safeMcpModelOutput,
    safeMcpOutput,
} from "@shared/agents/mcp-output.ts";

import {
    functionOutputText,
    type ResponseFunctionCall,
    type ResponseFunctionCallOutput,
} from "@shared/schemas/response-function-items.ts";

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character] ?? character,
    );
}

/** Chat clients display server-executed tools as details, not function calls. */
export function formatMcpCall(
    item: McpCall,
    seenUrls: Set<string>,
    isMcp = true,
): string {
    let output: unknown;
    let failed = item.status === "failed" || item.error !== null;
    const errorText = item.error === null ? null : mcpErrorText(item.error);
    let text = errorText ?? item.output ?? "";
    if (item.output) {
        try {
            output = JSON.parse(item.output);
            if (output && typeof output === "object" && "content" in output) {
                failed ||= "isError" in output && output.isError === true;
                if (isMcp) {
                    const modelOutput = safeMcpModelOutput({ output });
                    text =
                        errorText ??
                        (modelOutput.type === "text"
                            ? modelOutput.value
                            : modelOutput.value
                                  .map((part) => part.text)
                                  .join("\n"));
                }
            }
        } catch {
            // Upstream MCP output can also be plain text.
        }
    }
    const links: string[] = [];
    for (const part of safeMcpOutput(isMcp ? output : null).content) {
        if (part.type !== "resource_link") continue;
        const knownTool =
            item.server_label === "pollinations" &&
            item.name.startsWith("generate");
        if (
            !knownTool &&
            !/^(image|audio|video|model)\//.test(part.mimeType ?? "")
        ) {
            continue;
        }
        try {
            const url = new URL(part.uri);
            if (url.protocol !== "https:" || seenUrls.has(url.href)) continue;
            seenUrls.add(url.href);
            if (
                part.mimeType?.startsWith("image/") ||
                (knownTool && item.name === "generateImage")
            ) {
                links.push(`![Generated image](<${url.href}>)`);
            } else {
                const label = part.mimeType?.startsWith("audio/")
                    ? "Generated audio"
                    : part.mimeType?.startsWith("video/")
                      ? "Generated video"
                      : part.mimeType?.startsWith("model/")
                        ? "Generated 3D model"
                        : "Generated media";
                links.push(`[${label}](<${url.href}>)`);
            }
        } catch {
            // Ignore resource links that cannot be displayed safely.
        }
    }
    return (
        `\n\n<details type="tool_calls" done="true" ` +
        `id="${escapeHtml(item.id)}" name="${escapeHtml(item.name)}" ` +
        `arguments="${escapeHtml(item.arguments)}">\n` +
        `<summary>${failed ? "Tool Failed" : "Tool Executed"}</summary>\n` +
        `${escapeHtml(text)}\n</details>\n\n` +
        (links.length ? `${links.join("\n\n")}\n\n` : "")
    );
}

export function formatFunctionCall(
    call: ResponseFunctionCall,
    result: ResponseFunctionCallOutput,
    seenUrls: Set<string>,
): string {
    const tool = parseFunctionName(call.name);
    return formatMcpCall(
        {
            type: "mcp_call",
            id: call.call_id,
            server_label: tool?.serverLabel ?? "",
            name: tool?.name ?? call.name,
            arguments: call.arguments,
            status: "completed",
            output: functionOutputText(result.output),
            error: null,
            approval_request_id: null,
        },
        seenUrls,
        Boolean(tool),
    );
}
