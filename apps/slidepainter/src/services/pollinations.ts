// Pollinations API Service

import {
  PollinationsRequest,
  ImageGenerationResponse
} from './types';

const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai';
const DEFAULT_CONFIG = {
  model: 'gptimage' as const,
  enhance: true,
  nologo: true,
};

export class PollinationsService {
  private token: string | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  async generateImageFromPrompt(
    sectionPrompt: string,
    projectPrompt?: string,
    options?: Partial<PollinationsRequest>,
    inputImageUrl?: string
  ): Promise<ImageGenerationResponse> {
    try {
      const finalPrompt = projectPrompt
        ? `${projectPrompt}\n\n${sectionPrompt}`
        : sectionPrompt;

      if (!options?.width || !options?.height) {
        throw new Error('Width and height must be specified for image generation');
      }

      const payload: PollinationsRequest = {
        prompt: finalPrompt,
        model: options?.model || DEFAULT_CONFIG.model,
        width: options.width,
        height: options.height,
        enhance: options?.enhance ?? DEFAULT_CONFIG.enhance,
        nologo: options?.nologo ?? DEFAULT_CONFIG.nologo,
        seed: options?.seed || Math.floor(Math.random() * 1000000),
        ...(inputImageUrl && { imageUrl: inputImageUrl }),
      };

      // Build GET URL: https://gen.pollinations.ai/image/{prompt}
      const encodedPrompt = encodeURIComponent(payload.prompt);
      const url = new URL(`${POLLINATIONS_API_BASE}/image/${encodedPrompt}`);

      url.searchParams.set('model', payload.model || DEFAULT_CONFIG.model);
      url.searchParams.set('width', payload.width.toString());
      url.searchParams.set('height', payload.height.toString());
      url.searchParams.set('enhance', (payload.enhance ?? DEFAULT_CONFIG.enhance).toString());
      url.searchParams.set('nologo', (payload.nologo ?? DEFAULT_CONFIG.nologo).toString());
      url.searchParams.set('seed', payload.seed!.toString());

      if (payload.imageUrl && this.isValidUrl(payload.imageUrl)) {
        url.searchParams.set('imageUrl', payload.imageUrl);
      }

      const token = this.token || import.meta.env.VITE_POLLINATIONS_AI_TOKEN_2 || import.meta.env.VITE_POLLINATIONS_AI_TOKEN;

      // Publishable keys (pk_) use query param, Secret keys (sk_) use Authorization header
      const headers: HeadersInit = {};
      if (token) {
        if (token.startsWith('pk_')) {
          url.searchParams.set('key', token);
        } else {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(300000), // 5 minute timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error: ${response.status} ${response.statusText}`, errorText);

        if (response.status === 500) {
          throw new Error(`Backend overloaded (500) - Wait a few seconds and try again`);
        } else if (response.status === 401) {
          throw new Error(`Authentication failed (401) - Check your API key`);
        } else if (response.status === 403) {
          throw new Error(`Insufficient pollen balance (403) - Check https://enter.pollinations.ai`);
        } else {
          throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
        }
      }

      const result: ImageGenerationResponse = {
        url: url.toString(),
        provider: 'pollinations',
        seed: payload.seed,
        cached: false,
      };

      return result;

    } catch (error) {
      console.error('Pollinations generation failed:', error);
      throw error;
    }
  }

  private isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
