export interface PollinationsRequest {
  prompt: string;
  model?: string;
  width: number;
  height: number;
  seed?: number;
  enhance?: boolean;
  nologo?: boolean;
  imageUrl?: string;
}

export interface ImageGenerationResponse {
  url: string;
  provider: 'pollinations' | 'mock';
  seed?: number;
  cached?: boolean;
  error?: string;
}
