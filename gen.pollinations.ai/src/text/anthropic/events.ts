// Anthropic Messages SSE event encoding helpers.

import type { AnthropicMessageResponse } from "@shared/schemas/anthropic.ts";

export type AnthropicStreamEvent =
    | {
          type: "message_start";
          message: AnthropicMessageResponse;
          sequence_number: number;
      }
    | {
          type: "content_block_start";
          index: number;
          content_block: unknown;
          sequence_number: number;
      }
    | {
          type: "content_block_delta";
          index: number;
          delta: unknown;
          sequence_number: number;
      }
    | { type: "content_block_stop"; index: number; sequence_number: number }
    | {
          type: "message_delta";
          delta: unknown;
          usage: unknown;
          sequence_number: number;
      }
    | { type: "message_stop"; sequence_number: number }
    | { type: "ping"; sequence_number: number }
    | { type: "error"; error: { type: string; message: string } };

/** Encode one event as an SSE frame with the `event:` name Anthropic uses. */
export function toSseEvent(event: AnthropicStreamEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
