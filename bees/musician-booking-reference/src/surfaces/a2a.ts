import type { MusicianBookingAgent } from "../agent.js";
import { musicianBookingAgentManifest } from "../manifest.js";
import type { AgentReply } from "../types.js";

export type A2AJsonRpcRequest = {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: {
        message?: {
            messageId?: string;
            contextId?: string;
            role?: string;
            parts?: Array<{
                kind?: string;
                type?: string;
                text?: string;
            }>;
            metadata?: Record<string, unknown>;
        };
    };
};

export type A2AJsonRpcResponse =
    | {
          jsonrpc: "2.0";
          id?: string | number | null;
          result: {
              id: string;
              contextId: string;
              status: {
                  state: "completed" | "input-required";
                  timestamp: string;
              };
              artifacts: Array<{
                  artifactId: string;
                  name: string;
                  parts: Array<{ kind: "text"; text: string }>;
              }>;
              metadata: {
                  booking_id: string;
                  status: AgentReply["status"];
                  quote_total?: number;
                  tool_calls: string[];
                  needs_review: boolean;
              };
          };
      }
    | {
          jsonrpc: "2.0";
          id?: string | number | null;
          error: { code: number; message: string };
      };

export function createA2AAgentCard(baseUrl: string) {
    return {
        protocolVersion: "0.3.0",
        name: musicianBookingAgentManifest.name,
        description: musicianBookingAgentManifest.description,
        url: `${baseUrl.replace(/\/$/, "")}/a2a`,
        preferredTransport: "JSONRPC",
        capabilities: { streaming: false },
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        skills: [
            {
                id: "musician-booking",
                name: "Musician booking",
                description:
                    "Collect event details, quote musician packages, place holds, and confirm bookings.",
                tags: ["booking", "music", "events"],
                inputModes: ["text/plain"],
                outputModes: ["text/plain"],
            },
        ],
    };
}

function getText(request: A2AJsonRpcRequest): string {
    return (
        request.params?.message?.parts
            ?.filter((part) => part.kind === "text" || part.type === "text")
            .map((part) => part.text ?? "")
            .join("\n")
            .trim() ?? ""
    );
}

function getUserId(request: A2AJsonRpcRequest): string {
    const metadataUserId = request.params?.message?.metadata?.user_id;
    if (typeof metadataUserId === "string" && metadataUserId) {
        return metadataUserId;
    }
    return request.params?.message?.contextId ?? "a2a-anonymous";
}

export async function handleA2AMessageSend(
    agent: MusicianBookingAgent,
    request: A2AJsonRpcRequest,
    options: { now?: Date } = {},
): Promise<A2AJsonRpcResponse> {
    if (request.method !== "message/send") {
        return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: "Method not found" },
        };
    }

    const reply = await agent.handleInboundMessage({
        userId: getUserId(request),
        channel: "a2a",
        text: getText(request),
        now: options.now,
    });
    const timestamp = (options.now ?? new Date()).toISOString();

    return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
            id: request.params?.message?.messageId ?? reply.bookingId,
            contextId: reply.conversationId,
            status: {
                state: reply.needsReview ? "input-required" : "completed",
                timestamp,
            },
            artifacts: [
                {
                    artifactId: `reply_${reply.bookingId}`,
                    name: "booking-reply",
                    parts: [{ kind: "text", text: reply.text }],
                },
            ],
            metadata: {
                booking_id: reply.bookingId,
                status: reply.status,
                quote_total: reply.quoteTotal,
                tool_calls: reply.toolCalls,
                needs_review: reply.needsReview,
            },
        },
    };
}
