import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { toBase64 } from '../pollinations-utils';

export interface PollinationsMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
      }>
    | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

/**
 * Convert AI SDK prompt to Pollinations API message format
 */
export function convertToProviderMessages(
  prompt: LanguageModelV3Prompt,
  warnings: SharedV3Warning[],
): PollinationsMessage[] {
  const messages: PollinationsMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        messages.push({ role: 'system', content: message.content });
        break;
      }

      case 'user': {
        const userContent = Array.isArray(message.content)
          ? message.content
          : [{ type: 'text' as const, text: String(message.content) }];

        // Handle simple text-only content
        if (userContent.length === 1 && userContent[0].type === 'text') {
          messages.push({
            role: 'user',
            content: userContent[0].text,
          });
          break;
        }

        // Handle multipart content
        const userParts: Array<{
          type: string;
          text?: string;
          image_url?: { url: string };
        }> = [];

        for (const part of userContent) {
          switch (part.type) {
            case 'text': {
              userParts.push({ type: 'text', text: part.text });
              break;
            }
            case 'file': {
              if (part.mediaType.startsWith('image/')) {
                const mediaType =
                  part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

                let imageUrl: string;
                if (part.data instanceof URL) {
                  imageUrl = part.data.toString();
                } else {
                  imageUrl = `data:${mediaType};base64,${toBase64(part.data)}`;
                }

                userParts.push({
                  type: 'image_url',
                  image_url: { url: imageUrl },
                });
              } else {
                warnings.push({
                  type: 'other',
                  message: `File type ${part.mediaType} is not supported for Pollinations API`,
                });
              }
              break;
            }
            default: {
              warnings.push({
                type: 'other',
                message: `User content part type ${(part as any).type} is not supported`,
              });
            }
          }
        }

        messages.push({
          role: 'user',
          content: userParts,
        });
        break;
      }

      case 'assistant': {
        const assistantContent = Array.isArray(message.content)
          ? message.content
          : [{ type: 'text' as const, text: String(message.content) }];

        let assistantText = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of assistantContent) {
          switch (part.type) {
            case 'text': {
              assistantText += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
            case 'reasoning': {
              // Reasoning is not supported by Pollinations API, include as text
              warnings.push({
                type: 'other',
                message:
                  'Reasoning content is not supported by Pollinations API; including as text',
              });
              assistantText += part.text;
              break;
            }
            default: {
              warnings.push({
                type: 'other',
                message: `Assistant content part type ${(part as any).type} is not supported`,
              });
            }
          }
        }

        const assistantMessage: PollinationsMessage = {
          role: 'assistant',
          content: assistantText || null,
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        messages.push(assistantMessage);
        break;
      }

      case 'tool': {
        const toolContent = Array.isArray(message.content)
          ? message.content
          : [];

        // Pollinations API expects one tool result per message
        for (const toolResponse of toolContent) {
          if (toolResponse.type === 'tool-result') {
            let contentValue: string;
            const output = toolResponse.output;

            switch (output.type) {
              case 'text':
              case 'error-text': {
                contentValue = output.value;
                break;
              }
              case 'json':
              case 'error-json': {
                contentValue = JSON.stringify(output.value);
                break;
              }
              case 'content': {
                // Handle content type (array of text/media)
                contentValue = output.value
                  .map((item) => (item.type === 'text' ? item.text : ''))
                  .join('\n');
                break;
              }
              default: {
                contentValue = JSON.stringify(output);
              }
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolResponse.toolCallId,
              name: toolResponse.toolName,
              content: contentValue,
            });
          }
        }

        if (toolContent.length === 0) {
          warnings.push({
            type: 'other',
            message: 'Tool message has no tool results',
          });
          messages.push({
            role: 'tool',
            tool_call_id: '',
            name: '',
            content: JSON.stringify(message.content),
          });
        }
        break;
      }

      default: {
        throw new Error(`Unsupported message role: ${(message as any).role}`);
      }
    }
  }

  return messages;
}

/**
 * Prepare tools for Pollinations API format
 * Returns tools and any warnings about unsupported tool configurations
 */
export function prepareTools(tools: LanguageModelV3CallOptions['tools']): {
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  warnings: SharedV3Warning[];
} {
  const warnings: SharedV3Warning[] = [];

  if (!tools) {
    return { tools: [], warnings };
  }

  const pollinationsTools = tools
    .filter((tool) => {
      if (tool.type !== 'function') {
        warnings.push({
          type: 'unsupported',
          feature: 'tool',
          details: `Tool type ${tool.type} is not supported`,
        });
        return false;
      }
      return true;
    })
    .map((tool) => {
      // Type guard: ensure it's a function tool
      if (tool.type !== 'function') {
        throw new Error('Expected function tool');
      }

      // Get the input schema - should be a JSON Schema object
      // Following OpenAI pattern: parameters: tool.inputSchema
      const inputSchema = tool.inputSchema as Record<string, unknown>;

      // Ensure the schema is valid and has type: "object" at root level
      let parameters: Record<string, unknown>;

      if (
        !inputSchema ||
        typeof inputSchema !== 'object' ||
        Array.isArray(inputSchema)
      ) {
        // Invalid schema - create a default empty object schema
        parameters = {
          type: 'object',
          properties: {},
        };
        warnings.push({
          type: 'other',
          message: `Invalid schema for tool '${tool.name}': schema must be a JSON Schema object`,
        });
      } else {
        // Always ensure type: "object" is present at root level
        // Create a new object with type: "object" first, then spread the rest
        // This ensures type is always set correctly, even if missing from inputSchema
        parameters = {
          type: 'object',
          ...inputSchema,
        };
        // Explicitly set type to "object" to override any existing type
        parameters.type = 'object';

        // Warn if the original schema had a different type
        if (
          inputSchema.type !== undefined &&
          inputSchema.type !== null &&
          inputSchema.type !== 'object'
        ) {
          warnings.push({
            type: 'other',
            message: `Schema for tool '${tool.name}' must have type: "object" at root level, got type: "${inputSchema.type}"`,
          });
        }
      }

      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters,
        },
      };
    });

  return { tools: pollinationsTools, warnings };
}

/**
 * Map AI SDK tool choice to Pollinations API format
 */
export function mapToolChoice(
  toolChoice?: LanguageModelV3CallOptions['toolChoice'],
): 'none' | 'auto' | 'required' {
  if (!toolChoice || toolChoice.type === 'tool') {
    return 'auto';
  }
  return toolChoice.type;
}

/**
 * Normalize finish reason string by converting to lowercase and
 * standardizing separators (both underscores and hyphens become hyphens)
 */
function normalizeFinishReason(reason: string): string {
  return reason.toLowerCase().replace(/[-_]/g, '-');
}

/**
 * Map Pollinations API finish reason to AI SDK format
 * Handles various case formats and both underscore/hyphen variants
 * (normalization handles underscore/hyphen conversion, map uses normalized keys)
 */
const FINISH_REASON_MAP: Record<
  string,
  'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error'
> = {
  // Normal stop reasons
  stop: 'stop',
  // Length/max tokens reasons
  length: 'length',
  'max-tokens': 'length',
  'max-token': 'length',
  // Tool calls reasons (normalization handles tool_calls -> tool-calls)
  'tool-calls': 'tool-calls',
  toolcalls: 'tool-calls',
  // Content filter/safety reasons (normalization handles content_filter -> content-filter)
  'content-filter': 'content-filter',
  contentfilter: 'content-filter',
  safety: 'content-filter',
  'image-safety': 'content-filter',
  recitation: 'content-filter',
  blocklist: 'content-filter',
  'prohibited-content': 'content-filter',
  spii: 'content-filter',
  // Error reasons (normalization handles malformed_function_call -> malformed-function-call)
  error: 'error',
  'malformed-function-call': 'error',
  'function-call-error': 'error',
} as const;

export function mapFinishReason(
  finishReason: string | null | undefined,
  hasToolCalls?: boolean,
): 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' {
  if (!finishReason) {
    return 'stop';
  }

  const normalized = normalizeFinishReason(finishReason);
  const mapped = FINISH_REASON_MAP[normalized] ?? 'other';

  // If finish reason is 'stop' and there are tool calls, return 'tool-calls' instead
  if (mapped === 'stop' && hasToolCalls) {
    return 'tool-calls';
  }

  return mapped;
}
