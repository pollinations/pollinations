import {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  InvalidResponseDataError,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { handlePollinationsError } from '../pollinations-error-handler';
import { PollinationsConfig } from '../pollinations-provider';
import type { PollinationsImageModelSettings } from '../pollinations-types';
import { resolveSeed, toBase64 } from '../pollinations-utils';
import {
  isGptImageModel,
  isVideoModel,
  modelMaxImagesPerCall,
  PollinationsImageModelId,
} from './pollinations-image-options';

export class PollinationsImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';

  get maxImagesPerCall(): number {
    if (this.modelId in modelMaxImagesPerCall) {
      return (
        modelMaxImagesPerCall[
          this.modelId as keyof typeof modelMaxImagesPerCall
        ] ?? 1
      );
    }
    return 1;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: PollinationsImageModelId,
    private readonly settings: PollinationsImageModelSettings,
    private readonly config: PollinationsConfig,
  ) {}

  async doGenerate({
    prompt,
    n = 1,
    size,
    aspectRatio,
    seed,
    files,
    mask,
    abortSignal,
    providerOptions,
    headers,
  }: ImageModelV3CallOptions): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: SharedV3Warning[] = [];

    // Handle aspectRatio: supported for video models, warn for image models
    if (aspectRatio != null) {
      if (isVideoModel(this.modelId)) {
        // aspectRatio is supported for video models - will be added to params later
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            'aspectRatio is only supported for video models (veo, seedance, seedance-pro). Use `size` for image models.',
        });
      }
    }

    // Warn about unsupported mask parameter
    if (mask !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details:
          'Pollinations API does not support mask parameter. This parameter will be ignored.',
      });
    }

    // Map size to width/height
    // Pollinations API uses width and height parameters
    // Only set width/height if size is provided, otherwise let API use defaults
    let width: number | undefined;
    let height: number | undefined;

    if (size) {
      // Parse size format like "1024x1024" or use defaults
      const sizeMatch = size.match(/^(\d+)x(\d+)$/);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
      } else {
        // Common size presets
        switch (size) {
          case '256x256':
            width = 256;
            height = 256;
            break;
          case '512x512':
            width = 512;
            height = 512;
            break;
          case '1024x1024':
            width = 1024;
            height = 1024;
            break;
          case '1792x1024':
            width = 1792;
            height = 1024;
            break;
          case '1024x1792':
            width = 1024;
            height = 1792;
            break;
          case '2048x2048':
            width = 2048;
            height = 2048;
            break;
          case '2048x1024':
            width = 2048;
            height = 1024;
            break;
          case '1024x2048':
            width = 1024;
            height = 2048;
            break;
          default:
            // If size doesn't match known patterns, don't set width/height (let API default)
            break;
        }
      }
    }

    // Warn if n > 1 (Pollinations typically supports 1 image per call)
    if (n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details: `Pollinations API supports generating 1 image per call. Requested ${n} images, will generate 1.`,
      });
    }

    // Build URL with parameters
    // Pollinations uses GET endpoint: https://image.pollinations.ai/prompt/{prompt}?{params}
    const params = new URLSearchParams(this.config.queryParams());
    params.append('model', this.modelId);

    // Generate seed: uses provided seed from call options, or -1 for true randomness
    const finalSeed = resolveSeed(seed);
    params.append('seed', finalSeed.toString());

    // Only include width/height if explicitly provided via size parameter
    // API defaults to 1024x1024 if not provided
    if (width !== undefined) {
      params.append('width', width.toString());
    }
    if (height !== undefined) {
      params.append('height', height.toString());
    }

    // Add Pollinations-specific options from settings or providerOptions
    //  take precedence over settings
    const pollinationsOptions = providerOptions?.pollinations as
      | {
          nologo?: boolean;
          enhance?: boolean;
          private?: boolean;
          negative_prompt?: string;
          safe?: boolean;
          quality?: 'low' | 'medium' | 'high' | 'hd';
          transparent?: boolean;
          duration?: number;
          aspectRatio?: string;
          audio?: boolean;
          image?: string;
        }
      | undefined;

    // Settings-based options (providerOptions take precedence)
    const nologo = pollinationsOptions?.nologo ?? this.settings.nologo ?? false;
    const enhance =
      pollinationsOptions?.enhance ?? this.settings.enhance ?? false;
    const isPrivate =
      pollinationsOptions?.private ?? this.settings.private ?? false;

    if (nologo) {
      params.append('nologo', 'true');
    }
    if (enhance) {
      params.append('enhance', 'true');
    }
    if (isPrivate) {
      params.append('private', 'true');
    }

    // High Priority: Common image parameters
    if (pollinationsOptions?.negative_prompt !== undefined) {
      params.append('negative_prompt', pollinationsOptions.negative_prompt);
    }
    if (pollinationsOptions?.safe !== undefined) {
      params.append('safe', pollinationsOptions.safe ? 'true' : 'false');
    }

    // Medium Priority: Model-specific parameters with validation
    if (pollinationsOptions?.quality !== undefined) {
      if (isGptImageModel(this.modelId)) {
        params.append('quality', pollinationsOptions.quality);
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'quality',
          details:
            'quality parameter is only supported for gptimage models. This parameter will be ignored.',
        });
      }
    }

    if (pollinationsOptions?.transparent !== undefined) {
      if (isGptImageModel(this.modelId)) {
        params.append(
          'transparent',
          pollinationsOptions.transparent ? 'true' : 'false',
        );
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'transparent',
          details:
            'transparent parameter is only supported for gptimage models. This parameter will be ignored.',
        });
      }
    }

    // Low Priority: Video model parameters with validation
    if (isVideoModel(this.modelId)) {
      // aspectRatio - supported for video models
      if (aspectRatio !== undefined) {
        params.append('aspectRatio', aspectRatio);
      } else if (pollinationsOptions?.aspectRatio !== undefined) {
        params.append('aspectRatio', pollinationsOptions.aspectRatio);
      }

      // duration - validate per model
      if (pollinationsOptions?.duration !== undefined) {
        const modelDurationLimits: Record<string, number[]> = {
          veo: [4, 6, 8],
          seedance: [2, 3, 4, 5, 6, 7, 8, 9, 10],
          'seedance-pro': [2, 3, 4, 5, 6, 7, 8, 9, 10],
        };
        const allowedDurations = modelDurationLimits[this.modelId] || [];
        if (
          allowedDurations.length > 0 &&
          !allowedDurations.includes(pollinationsOptions.duration)
        ) {
          warnings.push({
            type: 'unsupported',
            feature: 'duration',
            details: `duration must be one of ${allowedDurations.join(', ')} for ${this.modelId} model. Got ${pollinationsOptions.duration}.`,
          });
        } else {
          params.append('duration', pollinationsOptions.duration.toString());
        }
      }

      // audio - only for veo
      if (pollinationsOptions?.audio !== undefined) {
        if (this.modelId === 'veo') {
          params.append('audio', pollinationsOptions.audio ? 'true' : 'false');
        } else {
          warnings.push({
            type: 'unsupported',
            feature: 'audio',
            details:
              'audio parameter is only supported for veo model. This parameter will be ignored.',
          });
        }
      }
    } else {
      // Warn if video-specific parameters are used with image models
      if (pollinationsOptions?.duration !== undefined) {
        warnings.push({
          type: 'unsupported',
          feature: 'duration',
          details:
            'duration parameter is only supported for video models (veo, seedance, seedance-pro). This parameter will be ignored.',
        });
      }
      if (pollinationsOptions?.audio !== undefined) {
        warnings.push({
          type: 'unsupported',
          feature: 'audio',
          details:
            'audio parameter is only supported for video models (veo). This parameter will be ignored.',
        });
      }
    }

    // Reference images (files parameter handling - basic implementation)
    if (pollinationsOptions?.image !== undefined) {
      params.append('image', pollinationsOptions.image);
    } else if (files && files.length > 0) {
      // Convert files to URLs/comma-separated format
      // For now, we'll handle URL-based files
      // TODO: Handle file uploads properly (may require different endpoint)
      const imageUrls = files
        .map((file) => {
          if (file instanceof URL) return file.toString();
          // For other file types, we'd need to upload them first
          // For now, skip non-URL files
          return null;
        })
        .filter((url): url is string => url !== null);

      if (imageUrls.length > 0) {
        params.append('image', imageUrls.join(','));
      }
    }

    if (this.config.referrer) {
      params.append('referrer', this.config.referrer);
    }

    const encodedPrompt = encodeURIComponent(prompt || '');
    const url = `${this.config.baseURL}/${encodedPrompt}?${params.toString()}`;

    // Add authentication if available
    const configHeaders = this.config.headers();
    // Filter out undefined values from headers
    const cleanConfigHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(configHeaders)) {
      if (value !== undefined) {
        cleanConfigHeaders[key] = value;
      }
    }
    const cleanHeaders: Record<string, string> = {};
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
          cleanHeaders[key] = value;
        }
      }
    }

    // Use custom fetch if provided, otherwise use global fetch
    const fetchFn = this.config.fetch ?? fetch;

    // Always fetch the image and return as base64 (required for AI SDK compatibility)
    // The URL is also included in metadata for reference
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        ...cleanConfigHeaders,
        ...cleanHeaders,
      },
      signal: abortSignal,
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

    // Convert Blob to base64 string (as per V3 spec, images should be base64 strings or Uint8Array)
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = toBase64(arrayBuffer);

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      responseHeaders[key] = value;
    });

    const currentDate = new Date();

    // Determine media type: prefer blob.type, then response Content-Type header, finally default
    const mediaType =
      response.headers.get('content-type') || blob.type || 'image/png';

    // Build metadata with URL always included for reference
    const metadata = {
      pollinations: {
        images: [
          {
            mediaType: mediaType,
            url: url, // Always include URL in metadata for reference
          },
        ],
      },
    } as ImageModelV3ProviderMetadata & {
      pollinations: {
        images: Array<{ mediaType: string; url?: string }>;
      };
    };

    let usage: ImageModelV3Usage | undefined;
    if (
      response.headers.has('x-usage-total-tokens') ||
      response.headers.has('x-usage-completion-image-tokens')
    ) {
      usage = {
        inputTokens: 0,
        outputTokens: parseInt(
          response.headers.get('x-usage-completion-image-tokens')!,
        ),
        totalTokens: parseInt(response.headers.get('x-usage-total-tokens')!),
      };
    }

    // Return in AI SDK V3 format with base64
    // Images array always contains base64, URL is available in metadata
    return {
      images: [base64], // Always return base64 for AI SDK compatibility
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: metadata,
      usage: usage,
    };
  }
}
