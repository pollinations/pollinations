import { z } from "zod";
import type {
    ResponseFunctionCall,
    ResponseFunctionCallOutput,
} from "../responses/functionItems.ts";
import { parseFunctionName } from "./functionItems.ts";

const McpCallErrorSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.enum(["mcp_protocol_error", "http_error"]),
        code: z.number().int(),
        message: z.string(),
    }),
    z.object({
        type: z.literal("mcp_tool_execution_error"),
        content: z.json(),
    }),
]);

export const McpCallSchema = z.object({
    type: z.literal("mcp_call"),
    id: z.string().min(1),
    server_label: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string(),
    status: z
        .enum(["in_progress", "completed", "incomplete", "calling", "failed"])
        .default("completed"),
    output: z.string().nullable().default(null),
    error: McpCallErrorSchema.nullable().default(null),
});

export type McpCall = z.infer<typeof McpCallSchema>;
type McpCallError = z.infer<typeof McpCallErrorSchema>;

/** Keep Chat rendering and model-visible replay consistent with structured errors. */
function mcpErrorText(error: McpCallError): string {
    if (error.type !== "mcp_tool_execution_error") return error.message;
    const content = error.content;
    if (
        content &&
        typeof content === "object" &&
        "content" in content &&
        Array.isArray(content.content)
    ) {
        const output = safeMcpModelOutput({ output: content });
        return output.type === "text"
            ? output.value
            : output.value.map((part) => part.text).join("\n");
    }
    return typeof content === "string" ? content : JSON.stringify(content);
}

const SafeMcpPartSchema = z.union([
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
        type: z.literal("resource_link"),
        uri: z.string(),
        name: z.string(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
    }),
]);

type SafeMcpOutput = {
    content: z.infer<typeof SafeMcpPartSchema>[];
    isError?: boolean;
};

// Retain usable output and media links without copying binary blobs into
// model history or the public Responses stream.
export function safeMcpOutput(output: unknown): SafeMcpOutput {
    const result = output as { content?: unknown; isError?: boolean } | null;
    return {
        content: Array.isArray(result?.content)
            ? result.content.flatMap((part) => {
                  const parsed = SafeMcpPartSchema.safeParse(part);
                  if (parsed.success) return [parsed.data];
                  if (
                      !part ||
                      typeof part !== "object" ||
                      typeof part.type !== "string"
                  )
                      return [];
                  if (
                      part.type === "resource" &&
                      typeof part.resource?.text === "string"
                  ) {
                      return [
                          { type: "text" as const, text: part.resource.text },
                      ];
                  }
                  return [
                      {
                          type: "text" as const,
                          text: `[${part.type} output omitted; use an HTTPS resource link]`,
                      },
                  ];
              })
            : [],
        ...(result?.isError ? { isError: true } : {}),
    };
}

export function safeMcpModelOutput({ output }: { output: unknown }) {
    const value = safeMcpOutput(output).content.map((part) => ({
        type: "text" as const,
        text:
            part.type === "text"
                ? part.text
                : JSON.stringify({
                      type: part.type,
                      ...(part.type === "resource_link"
                          ? {
                                uri: part.uri,
                                name: part.name,
                                description: part.description,
                                mimeType: part.mimeType,
                            }
                          : {}),
                  }),
    }));
    return value.length
        ? { type: "content" as const, value }
        : {
              type: "text" as const,
              value: "Tool completed without text or linked output.",
          };
}

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
export function formatMcpCall(item: McpCall, seenUrls: Set<string>): string {
    let output: unknown;
    let failed = item.status === "failed" || item.error !== null;
    const errorText = item.error === null ? null : mcpErrorText(item.error);
    let text = errorText ?? item.output ?? "";
    if (item.output) {
        try {
            output = JSON.parse(item.output);
            if (output && typeof output === "object" && "content" in output) {
                failed ||= "isError" in output && output.isError === true;
                const modelOutput = safeMcpModelOutput({ output });
                text =
                    errorText ??
                    (modelOutput.type === "text"
                        ? modelOutput.value
                        : modelOutput.value
                              .map((part) => part.text)
                              .join("\n"));
            }
        } catch {
            // Upstream MCP output can also be plain text.
        }
    }
    const links: string[] = [];
    for (const part of safeMcpOutput(output).content) {
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
            output: result.output,
            error: null,
        },
        seenUrls,
    );
}
