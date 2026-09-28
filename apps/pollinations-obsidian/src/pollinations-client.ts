// pollinations-client.ts — API client for the Pollinations AI API
//
// Supports both Bearer token auth (for account API keys) and ?key= query param.
// Endpoints:
//   POST https://gen.pollinations.ai/v1/chat/completions  — chat/text
//   GET https://image.pollinations.ai/{prompt}?model=...   — images
//   GET https://gen.pollinations.ai/audio/{prompt}?voice=... — speech
//   GET https://gen.pollinations.ai/{text|image|audio}/models — model lists

export interface ModelInfo {
  name: string;
  aliases?: string[];
  title?: string;
  description?: string;
  category?: string;
  publisher?: string;
  community?: boolean;
  paid_only?: boolean;
  supported_endpoints?: string[];
  pricing?: Record<string, unknown>;
  health?: { status: string; success_rate: number; requests: number };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  choices: {
    message: { content: string };
    index?: number;
  }[];
  error?: { message: string; code?: string };
}

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * PollinationsClient — Lightweight HTTP client for the Pollinations API.
 * Handles text, image, and speech generation plus model listing.
 */
export class PollinationsClient {
  public apiKey: string = '';
  public baseUrl: string = 'https://gen.pollinations.ai';

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  private getAuthHeader(): Record<string, string> {
    return this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}` }
      : {};
  }

  private getUrlWithKey(url: string): string {
    if (!this.apiKey) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}key=${encodeURIComponent(this.apiKey)}`;
  }

  /** POST /v1/chat/completions — generate text */
  async generateText(
    prompt: string,
    model: string = 'openai/gpt-5.4-nano',
    systemPrompt: string = '',
    maxTokens: number = 1024
  ): Promise<string> {
    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: maxTokens,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
    };

    const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Text generation failed: ${resp.status} ${err}`);
    }

    // Handle streaming if requested
    if (payload.stream && resp.body) {
      // Streaming implementation would go here
      // For now, return non-streaming
    }

    const data: ChatCompletionResponse = await resp.json();
    if (data.error) {
      throw new Error(`API error: ${data.error.message}`);
    }

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    throw new Error('No content in response');
  }

  /** GET /image/{prompt} — generate an image, returns blob URL */
  async generateImage(
    prompt: string,
    model: string = 'gptimage',
    width: number = 1024,
    height: number = 1024,
    nologo: boolean = true
  ): Promise<string> {
    const params = new URLSearchParams({
      model,
      width: width.toString(),
      height: height.toString(),
      nologo: nologo.toString(),
    });

    const url = `${this.baseUrl.replace('/v1', '')}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
    const finalUrl = this.getUrlWithKey(url);

    const resp = await fetch(finalUrl);
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Image generation failed: ${resp.status} ${err}`);
    }

    const blob = await resp.blob();
    // Revoke previous blob URLs to avoid memory leaks
    return URL.createObjectURL(blob);
  }

  /** GET /audio/{prompt} — generate speech, returns blob URL */
  async generateSpeech(
    prompt: string,
    voice: string = 'nova',
    model: string = 'openai/gpt-4o-mini-tts'
  ): Promise<string> {
    const params = new URLSearchParams({ voice });
    if (model) params.set('model', model);

    const url = `${this.baseUrl}/audio/${encodeURIComponent(prompt)}?${params.toString()}`;
    const finalUrl = this.getUrlWithKey(url);

    const resp = await fetch(finalUrl);
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Speech generation failed: ${resp.status} ${err}`);
    }

    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  /** GET /{type}/models — fetch live model lists */
  async getModels(type: 'text' | 'image' | 'audio'): Promise<ModelInfo[]> {
    const url = `${this.baseUrl}/${type}/models`;
    const headers = this.getAuthHeader();

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Model list fetch failed: ${resp.status} ${err}`);
    }

    const data: ModelInfo[] = await resp.json();
    return data;
  }

  /** POST /device — initiate OAuth Device Flow (for BYOP) */
  async startDeviceFlow(clientId: string): Promise<DeviceFlowResponse> {
    const form = new URLSearchParams();
    form.append('client_id', clientId);
    form.append('scope', 'usage');

    const resp = await fetch('https://enter.pollinations.ai/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Device flow initiation failed: ${resp.status} ${err}`);
    }

    return (await resp.json()) as DeviceFlowResponse;
  }

  /** Poll token endpoint for device flow */
  async pollDeviceToken(deviceCode: string, clientId: string): Promise<TokenResponse | { pending: true }> {
    const form = new URLSearchParams();
    form.append('device_code', deviceCode);
    form.append('client_id', clientId);
    form.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

    const resp = await fetch('https://enter.pollinations.ai/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      // authorization_pending, slow_down, expired_token, access_denied
      if (resp.status === 400 && err.includes('authorization_pending')) {
        return { pending: true };
      }
      throw new Error(`Token polling failed: ${resp.status} ${err}`);
    }

    return (await resp.json()) as TokenResponse;
  }
}
