import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { InvalidResponseDataError } from '@ai-sdk/provider';
import { handlePollinationsError } from '../pollinations-error-handler';
import { PollinationsConfig } from '../pollinations-provider';
import type {
  PollinationsLanguageModelSettings,
  PollinationsResponse,
} from '../pollinations-types';
import { resolveSeed } from '../pollinations-utils';
import { extractGroundingSourcesFromMetadata } from './pollinations-language-utils';
import {
  convertToProviderMessages,
  mapFinishReason,
  mapToolChoice,
  prepareTools,
} from './pollinations-message-converter';
import {
  createPollinationsParser,
  createPollinationsTransformer,
} from './pollinations-stream-transformer';

export class PollinationsLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider: string;
  readonly modelId: string;

  private readonly settings: PollinationsLanguageModelSettings;
  private readonly config: PollinationsConfig;

  constructor(
    modelId: string,
    settings: PollinationsLanguageModelSettings,
    config: PollinationsConfig,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  // Supported URL patterns for native file handling
  readonly supportedUrls = {
    'image/*': [/^https?:\/\/.*$/],
  };

  // Convert AI SDK prompt to provider format
  private getArgs(options: LanguageModelV3CallOptions): {
    args: Record<string, unknown>;
    warnings: SharedV3Warning[];
  } {
    const warnings: SharedV3Warning[] = [];

    // Map messages to provider format
    let messages = convertToProviderMessages(options.prompt, warnings);

    // Handle response format (proper implementation)
    let responseFormat: Record<string, unknown> | undefined;
    if (options.responseFormat) {
      if (options.responseFormat.type === 'json') {
        // JSON mode - determine if json_object or json_schema
        if (options.responseFormat.schema) {
          // Use json_schema format
          responseFormat = {
            type: 'json_schema',
            json_schema: {
              schema: options.responseFormat.schema,
              ...(options.responseFormat.name && {
                name: options.responseFormat.name,
              }),
              ...(options.responseFormat.description && {
                description: options.responseFormat.description,
              }),
            },
          };
        } else {
          // Simple JSON object mode
          responseFormat = {
            type: 'json_object',
          };
        }
      } else {
        // Text mode (explicit)
        responseFormat = {
          type: 'text',
        };
      }
    }

    // Warn about unsupported parameters
    if (options.topK !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'topK',
        details:
          'Pollinations API does not support topK parameter. Use temperature or topP instead.',
      });
    }

    if (options.includeRawChunks) {
      warnings.push({
        type: 'unsupported',
        feature: 'includeRawChunks',
        details:
          'Pollinations API does not support includeRawChunks parameter. This setting will be ignored.',
      });
    }

    // Generate seed: uses provided seed from call options, or -1 for true randomness
    const seed = resolveSeed(options.seed);

    // Build request body
    const body: Record<string, unknown> = {
      model: this.modelId,
      messages,
      seed,
    };

    // Only include parameters if explicitly provided
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== undefined) {
      body.max_tokens = options.maxOutputTokens;
    }
    if (options.topP !== undefined) {
      body.top_p = options.topP;
    }

    // Add stop sequences if provided
    if (options.stopSequences && options.stopSequences.length > 0) {
      body.stop = options.stopSequences;
    }

    // Add frequency and presence penalties (from V3 call options)
    if (options.frequencyPenalty !== undefined) {
      body.frequency_penalty = options.frequencyPenalty;
    }
    if (options.presencePenalty !== undefined) {
      body.presence_penalty = options.presencePenalty;
    }

    // Add response format if specified
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    // Handle tools if provided
    if (options.tools && options.tools.length > 0) {
      const { tools: pollinationsTools, warnings: toolWarnings } = prepareTools(
        options.tools,
      );
      warnings.push(...toolWarnings);
      if (pollinationsTools.length > 0) {
        body.tools = pollinationsTools;
        if (options.toolChoice) {
          body.tool_choice = mapToolChoice(options.toolChoice);
        }
      }
    }

    // Handle additional parameters via providerOptions.pollinations
    // Merge settings with providerOptions (providerOptions take precedence)
    // All options are passed through to the API to support future API updates
    const pollinationsOptions = options.providerOptions?.pollinations as
      | Record<string, unknown>
      | undefined;

    // Start with settings, then override with providerOptions
    const mergedOptions: Record<string, unknown> = { ...this.settings };

    if (pollinationsOptions) {
      // Override with providerOptions (takes precedence)
      for (const [key, value] of Object.entries(pollinationsOptions)) {
        if (value !== undefined) {
          mergedOptions[key] = value;
        }
      }
    }

    // Pass all merged options to the API
    for (const [key, value] of Object.entries(mergedOptions)) {
      if (value !== undefined) {
        body[key] = value;
      }
    }

    return { args: body, warnings };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = this.getArgs(options);

    let response: PollinationsResponse;
    let responseHeaders: Record<string, string> = {};

    // Use custom fetch if provided, otherwise use global fetch
    const fetchFn = this.config.fetch ?? fetch;

    try {
      const fetchResponse = await fetchFn(this.config.baseURL, {
        method: 'POST',
        headers: this.config.headers(),
        body: JSON.stringify(args),
        signal: options.abortSignal,
      });

      // Extract response headers
      fetchResponse.headers.forEach((value: string, key: string) => {
        responseHeaders[key] = value;
      });

      if (!fetchResponse.ok) {
        await handlePollinationsError(fetchResponse, this.config.baseURL);
      }

      response = await fetchResponse.json();
    } catch (error) {
      await handlePollinationsError(error, this.config.baseURL); // This throws, so response is definitely assigned below
    }

    // Convert provider response to AI SDK format
    const content: LanguageModelV3Content[] = [];

    const choice = response!.choices?.[0];
    if (!choice) {
      throw new InvalidResponseDataError({
        data: response!,
        message: 'No choices in response',
      });
    }

    // Extract reasoning content (before text)
    const reasoning = choice.message?.reasoning_content;
    if (reasoning != null && reasoning.length > 0) {
      content.push({
        type: 'reasoning',
        text: reasoning,
      });
    }

    // Extract text content
    if (choice.message?.content) {
      content.push({
        type: 'text',
        text: choice.message.content,
      });
    }

    // Extract citations as source parts (e.g. Perplexity-style responses)
    if (Array.isArray(response!.citations)) {
      for (const url of response!.citations) {
        if (!url) continue;
        content.push({
          type: 'source',
          sourceType: 'url',
          id: this.config.generateId(),
          url,
        });
      }
    }

    // Extract grounded sources from groundingMetadata (e.g. Vertex-style responses)
    const groundingSources = extractGroundingSourcesFromMetadata(
      // Grounding metadata is attached per choice in the Pollinations response
      choice.groundingMetadata,
      this.config.generateId,
    );

    if (groundingSources) {
      content.push(...groundingSources);
    }

    // Extract OpenAI-style annotations as URL sources (e.g. gpt-4/5 via Pollinations)
    const annotations = choice.message?.annotations;

    if (Array.isArray(annotations)) {
      for (const annotation of annotations) {
        const url = annotation.url_citation?.url;
        if (!url) continue;
        content.push({
          type: 'source',
          sourceType: 'url',
          id: this.config.generateId(),
          url,
          title: annotation.url_citation?.title ?? undefined,
        });
      }
    }

    // Extract tool calls
    if (choice.message?.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (!toolCall.id || !toolCall.function?.name) {
          warnings.push({
            type: 'other',
            message:
              'Invalid tool call in response: missing id or function name',
          });
          continue;
        }

        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments || '{}',
        });
      }
    }

    return {
      content,
      finishReason: {
        unified: mapFinishReason(
          choice.finish_reason,
          content.some(
            (part) => part.type === 'tool-call' && !part.providerExecuted,
          ),
        ),
        raw: choice.finish_reason ?? undefined,
      },
      usage: {
        inputTokens: {
          total: response!.usage?.prompt_tokens ?? 0,
          noCache: 0,
          cacheRead: response!.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWrite: 0,
        },
        outputTokens: {
          total: response!.usage?.completion_tokens ?? 0,
          text: 0,
          reasoning:
            response!.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        },
      },
      request: { body: args },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = this.getArgs(options);

    // Add stream: true parameter for streaming responses
    const streamArgs: Record<string, unknown> = { ...args, stream: true };

    // Handle stream_options if provided via providerOptions
    const pollinationsOptions = options.providerOptions?.pollinations as
      | Record<string, unknown>
      | undefined;

    if (pollinationsOptions?.stream_options) {
      streamArgs.stream_options = pollinationsOptions.stream_options;
    }

    // Use custom fetch if provided, otherwise use global fetch
    const fetchFn = this.config.fetch ?? fetch;

    let response: Response;
    try {
      // According to Pollinations API docs: https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/APIDOCS.md
      // The stream parameter enables real-time chunked responses
      response = await fetchFn(this.config.baseURL, {
        method: 'POST',
        headers: {
          ...this.config.headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamArgs),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        await handlePollinationsError(response, this.config.baseURL);
      }

      if (!response.body) {
        throw new InvalidResponseDataError({
          data: response,
          message: 'Response body is null',
        });
      }
    } catch (error) {
      await handlePollinationsError(error, this.config.baseURL);
    }

    // Transform stream to AI SDK format
    const stream = response!
      .body!.pipeThrough(new TextDecoderStream())
      .pipeThrough(createPollinationsParser())
      .pipeThrough(createPollinationsTransformer(warnings));

    return { stream };
  }
}
