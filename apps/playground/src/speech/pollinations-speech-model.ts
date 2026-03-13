import { SharedV3Warning, SpeechModelV3 } from '@ai-sdk/provider';
import { combineHeaders } from '@ai-sdk/provider-utils';
import { handlePollinationsError } from '../pollinations-error-handler';
import { PollinationsConfig } from '../pollinations-provider';
import {
  PollinationsAudioFormat,
  PollinationsSpeechModelId,
  PollinationsVoice,
} from './pollinations-speech-options';

interface PollinationsSpeechModelConfig extends PollinationsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class PollinationsSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider: string;
  readonly modelId: PollinationsSpeechModelId;

  constructor(
    modelId: PollinationsSpeechModelId,
    private readonly config: PollinationsSpeechModelConfig,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
  }

  private async getArgs({
    text,
    voice = 'alloy',
    outputFormat = 'mp3',
    speed,
    instructions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    // Build messages array - add system message if instructions are provided
    const messages: Array<{ role: string; content: string }> = [];
    if (instructions !== undefined) {
      messages.push({
        role: 'system',
        content: instructions,
      });
    }
    messages.push({
      role: 'user',
      content: text,
    });

    const requestBody: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      modalities: string[];
      audio: { voice: string; format: string };
    } = {
      model: this.modelId,
      messages,
      modalities: ['text', 'audio'],
      audio: {
        voice,
        format: outputFormat,
      },
    };

    // Warn about unsupported parameters
    if (speed !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details:
          'Pollinations API does not support speed parameter for audio generation. This parameter will be ignored.',
      });
    }

    // Validate output format
    const supportedFormats: PollinationsAudioFormat[] = [
      'mp3',
      'opus',
      'flac',
      'wav',
      'pcm16',
    ];
    if (
      outputFormat &&
      !supportedFormats.includes(outputFormat as PollinationsAudioFormat)
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
      });
      requestBody.audio.format = 'mp3';
    }

    // Validate voice
    const supportedVoices: PollinationsVoice[] = [
      'alloy',
      'echo',
      'fable',
      'onyx',
      'shimmer',
      'coral',
      'verse',
      'ballad',
      'ash',
      'sage',
      'amuch',
      'dan',
    ];
    if (!supportedVoices.includes(voice as PollinationsVoice)) {
      warnings.push({
        type: 'unsupported',
        feature: 'voice',
        details: `Unsupported voice: ${voice}. Using 'alloy' instead.`,
      });
      requestBody.audio.voice = 'alloy';
    }

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    // Use custom fetch if provided, otherwise use global fetch
    const fetchFn = this.config.fetch ?? fetch;

    let responseHeaders: Record<string, string> = {};
    let responseData: {
      choices?: Array<{
        message?: {
          audio?: {
            data?: string;
            transcript?: string;
            id?: string;
            expires_at?: number;
          };
        };
      }>;
    };

    try {
      const combinedHeaders = combineHeaders(
        this.config.headers(),
        options.headers,
      );
      // Filter out undefined values
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(combinedHeaders)) {
        if (value !== undefined) {
          headers[key] = value;
        }
      }

      const fetchResponse = await fetchFn(this.config.baseURL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });

      // Extract response headers
      fetchResponse.headers.forEach((value: string, key: string | number) => {
        responseHeaders[key] = value;
      });

      if (!fetchResponse.ok) {
        await handlePollinationsError(fetchResponse, this.config.baseURL);
      }

      responseData = await fetchResponse.json();
    } catch (error) {
      await handlePollinationsError(error, this.config.baseURL);
      throw error; // handlePollinationsError throws, but TypeScript needs this
    }

    // Extract audio data from response
    // Pollinations returns: { choices: [{ message: { audio: { data: string, transcript: string, ... } } }] }
    const choice = responseData.choices?.[0];
    const audioData = choice?.message?.audio?.data;

    if (!audioData) {
      throw new Error(
        'Invalid response: missing audio data in Pollinations API response',
      );
    }

    // Convert base64 string to Uint8Array
    // The audio data is base64-encoded
    const binaryString = atob(audioData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return {
      audio: bytes,
      warnings,
      request: {
        body: JSON.stringify(requestBody),
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: JSON.stringify(responseData),
      },
    };
  }
}
