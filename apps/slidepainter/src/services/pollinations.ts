// Pollinations API Service

import {
  PollinationsRequest,
  ImageGenerationResponse
} from './types';

const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai';
const MEDIA_API_BASE = 'https://media.pollinations.ai';
const MEDIA_UPLOAD_URL = `${MEDIA_API_BASE}/upload`;
const MEDIA_HOST = 'media.pollinations.ai';
const DEFAULT_CONFIG = {
  model: 'gptimage' as const,
  enhance: true,
  nologo: true,
};

type MediaUploadOptions = {
  visibility?: 'private' | 'unlisted' | 'public';
  relationship?: string;
  tags?: string[];
  parents?: string[];
  prompt?: string;
  model?: string;
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

      let resultUrl = url.toString();
      if (token) {
        try {
          const blob = await response.blob();
          const mediaUrl = await this.uploadGeneratedMedia(
            blob,
            `slidepainter-${Date.now()}.png`,
            token,
            {
              visibility: 'private',
              relationship: inputImageUrl ? 'slide_edit' : 'slide_generation',
              tags: ['slidepainter', 'slide'],
              parents: inputImageUrl ? [inputImageUrl] : [],
              prompt: finalPrompt,
              model: payload.model,
            }
          );
          if (mediaUrl) resultUrl = mediaUrl;
        } catch (uploadError) {
          console.warn('Media catalog upload failed, using generated image URL:', uploadError);
        }
      }

      const result: ImageGenerationResponse = {
        url: resultUrl,
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

  private mediaParent(urlString: string): string | null {
    try {
      const url = new URL(urlString);
      return url.hostname === MEDIA_HOST ? urlString : null;
    } catch {
      return null;
    }
  }

  private appendCatalogFields(formData: FormData, options: MediaUploadOptions): void {
    formData.append('visibility', options.visibility ?? 'private');
    formData.append('relationship', options.relationship ?? 'slide_generation');
    formData.append('kind', 'generation');
    for (const tag of options.tags ?? []) {
      formData.append('tags', tag);
    }
    for (const parent of options.parents ?? []) {
      const cleanParent = this.mediaParent(parent);
      if (cleanParent) formData.append('parents', cleanParent);
    }
    if (options.prompt) formData.append('prompt', options.prompt);
    if (options.model) formData.append('model', options.model);
  }

  private async uploadGeneratedMedia(
    blob: Blob,
    filename: string,
    token: string,
    options: MediaUploadOptions
  ): Promise<string | null> {
    const formData = new FormData();
    formData.append('file', blob, filename);
    this.appendCatalogFields(formData, options);

    const response = await fetch(MEDIA_UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.url) return data.url;
    if (data.id) return `${MEDIA_API_BASE}/${data.id}`;
    return null;
  }
}
