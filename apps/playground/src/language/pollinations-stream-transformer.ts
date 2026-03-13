import type {
  LanguageModelV3StreamPart,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import type { PollinationsStreamChunk } from '../pollinations-types';
import { extractGroundingSourcesFromMetadata } from './pollinations-language-utils';
import { mapFinishReason } from './pollinations-message-converter';

/**
 * Check if a string is valid JSON
 */
function isParsableJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a parser for Pollinations SSE stream
 */
export function createPollinationsParser(): TransformStream<
  string,
  PollinationsStreamChunk
> {
  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') {
          controller.terminate();
          return;
        }

        try {
          const data = JSON.parse(trimmed.slice(6));
          controller.enqueue(data);
        } catch (error) {
          // Skip invalid JSON
        }
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            controller.enqueue(data);
          } catch (error) {
            // Skip invalid JSON
          }
        }
      }
    },
  });
}

/**
 * Finish any pending tool calls that haven't been completed yet.
 * This is used both when the stream finishes normally and during flush cleanup.
 */
function finishPendingToolCalls(
  toolCalls: Map<
    number,
    {
      id?: string;
      name?: string;
      args: string;
      hasFinished: boolean;
    }
  >,
  controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
): void {
  for (const toolCall of toolCalls.values()) {
    if (!toolCall.hasFinished && toolCall.id && toolCall.name) {
      // Even if args aren't valid JSON, emit the tool call
      if (toolCall.args.length > 0) {
        controller.enqueue({
          type: 'tool-input-end',
          id: toolCall.id,
        });
      }

      controller.enqueue({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: toolCall.args || '{}',
      });
    }
  }
}

/**
 * Create a transformer for Pollinations stream chunks to AI SDK format
 */
export function createPollinationsTransformer(
  warnings: SharedV3Warning[],
): TransformStream<PollinationsStreamChunk, LanguageModelV3StreamPart> {
  let isFirstChunk = true;
  let isActiveReasoning = false;
  let isActiveText = false;
  let hasEmittedGroundingSources = false;
  const reasoningId = 'reasoning-0';
  const textId = '0';
  const toolCalls = new Map<
    number,
    {
      id?: string;
      name?: string;
      args: string;
      hasFinished: boolean;
    }
  >();

  return new TransformStream({
    transform(chunk, controller) {
      // Send warnings with first chunk
      if (isFirstChunk) {
        controller.enqueue({ type: 'stream-start', warnings });

        // Handle response metadata
        if (chunk.model) {
          controller.enqueue({
            type: 'response-metadata',
            modelId: chunk.model,
          });
        }

        // Emit citations as sources (e.g. Perplexity-style responses)
        if (Array.isArray(chunk.citations)) {
          for (const url of chunk.citations) {
            if (!url) continue;
            controller.enqueue({
              type: 'source',
              sourceType: 'url',
              id: generateId(),
              url,
            });
          }
        }

        isFirstChunk = false;
      }

      const choice = chunk.choices?.[0];
      if (!choice) return;

      const delta = choice.delta;

      // Emit grounded sources once per stream if grounding metadata is present
      if (choice.groundingMetadata && !hasEmittedGroundingSources) {
        const groundingSources = extractGroundingSourcesFromMetadata(
          choice.groundingMetadata,
          generateId,
        );
        if (groundingSources) {
          for (const source of groundingSources) {
            controller.enqueue(source as LanguageModelV3StreamPart);
          }
          hasEmittedGroundingSources = true;
        }
      }

      // Emit OpenAI-style annotations as streaming URL sources (e.g. gpt-4/5 via Pollinations)
      const annotations = (delta as any).annotations as
        | Array<{
            url_citation?: { url?: string; title?: string | null };
          }>
        | undefined;

      if (Array.isArray(annotations)) {
        for (const annotation of annotations) {
          const url = annotation.url_citation?.url;
          if (!url) continue;
          controller.enqueue({
            type: 'source',
            sourceType: 'url',
            id: generateId(),
            url,
            title: annotation.url_citation?.title ?? undefined,
          });
        }
      }

      // Handle reasoning content (before text) - following DeepSeek pattern
      const reasoningContent = delta.reasoning_content;
      if (reasoningContent) {
        if (!isActiveReasoning) {
          controller.enqueue({
            type: 'reasoning-start',
            id: reasoningId,
          });
          isActiveReasoning = true;
        }

        controller.enqueue({
          type: 'reasoning-delta',
          id: reasoningId,
          delta: reasoningContent,
        });
      }

      // Handle text content - following OpenAI pattern with text-start/text-delta/text-end
      if (delta.content) {
        // End reasoning when text starts
        if (isActiveReasoning) {
          controller.enqueue({
            type: 'reasoning-end',
            id: reasoningId,
          });
          isActiveReasoning = false;
        }

        if (!isActiveText) {
          controller.enqueue({ type: 'text-start', id: textId });
          isActiveText = true;
        }
        controller.enqueue({
          type: 'text-delta',
          id: textId,
          delta: delta.content,
        });
      }

      // Handle tool calls - following OpenAI pattern with tool-input-start/tool-input-delta/tool-input-end
      if (delta.tool_calls) {
        // End reasoning when tool calls start
        if (isActiveReasoning) {
          controller.enqueue({
            type: 'reasoning-end',
            id: reasoningId,
          });
          isActiveReasoning = false;
        }

        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          if (index === undefined) continue;

          // Tool call start - OpenAI returns all information except arguments in first chunk
          if (toolCalls.get(index) == null) {
            if (toolCallDelta.type && toolCallDelta.type !== 'function') {
              // Skip non-function tool calls
              continue;
            }

            if (!toolCallDelta.id || !toolCallDelta.function?.name) {
              // Wait for complete tool call info
              continue;
            }

            controller.enqueue({
              type: 'tool-input-start',
              id: toolCallDelta.id,
              toolName: toolCallDelta.function.name,
            });

            const toolCall = {
              id: toolCallDelta.id,
              name: toolCallDelta.function.name,
              args: toolCallDelta.function.arguments ?? '',
              hasFinished: false,
            };

            toolCalls.set(index, toolCall);

            // If arguments are already present and valid JSON, complete immediately
            if (
              toolCall.args.length > 0 &&
              isParsableJson(toolCall.args) &&
              toolCall.name
            ) {
              controller.enqueue({
                type: 'tool-input-delta',
                id: toolCall.id,
                delta: toolCall.args,
              });

              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              });

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.name,
                input: toolCall.args,
              });

              toolCall.hasFinished = true;
            } else if (toolCall.args.length > 0) {
              // Send initial delta if arguments have started
              controller.enqueue({
                type: 'tool-input-delta',
                id: toolCall.id,
                delta: toolCall.args,
              });
            }

            continue;
          }

          // Existing tool call - accumulate arguments
          const toolCall = toolCalls.get(index);
          if (!toolCall || toolCall.hasFinished) {
            continue;
          }

          if (toolCallDelta.function?.arguments) {
            toolCall.args += toolCallDelta.function.arguments;

            // Send delta
            if (toolCall.id) {
              controller.enqueue({
                type: 'tool-input-delta',
                id: toolCall.id,
                delta: toolCallDelta.function.arguments,
              });
            }

            // Check if tool call is complete (valid JSON)
            if (toolCall.name && toolCall.id && isParsableJson(toolCall.args)) {
              controller.enqueue({
                type: 'tool-input-end',
                id: toolCall.id,
              });

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.name,
                input: toolCall.args,
              });

              toolCall.hasFinished = true;
            }
          }
        }
      }

      // Handle finish reason
      if (choice.finish_reason) {
        // Finish any active reasoning
        if (isActiveReasoning) {
          controller.enqueue({ type: 'reasoning-end', id: reasoningId });
          isActiveReasoning = false;
        }

        // Finish any active text
        if (isActiveText) {
          controller.enqueue({ type: 'text-end', id: textId });
          isActiveText = false;
        }

        // Finish any pending tool calls
        finishPendingToolCalls(toolCalls, controller);
        toolCalls.clear();

        controller.enqueue({
          type: 'finish',
          finishReason: {
            unified: mapFinishReason(choice.finish_reason),
            raw: choice.finish_reason ?? undefined,
          },
          usage: {
            inputTokens: {
              total: chunk.usage?.prompt_tokens,
              noCache: 0,
              cacheRead:
                chunk?.usage?.prompt_tokens_details?.cached_tokens ?? 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: chunk.usage?.completion_tokens,
              text: 0,
              reasoning:
                chunk?.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
            },
          },
        });
      }
    },
    flush(controller) {
      // Finish any active reasoning
      if (isActiveReasoning) {
        controller.enqueue({ type: 'reasoning-end', id: reasoningId });
      }

      // Finish any active text
      if (isActiveText) {
        controller.enqueue({ type: 'text-end', id: textId });
      }

      // Finish any pending tool calls
      finishPendingToolCalls(toolCalls, controller);
    },
  });
}
