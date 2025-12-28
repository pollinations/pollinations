export type PollinationsModel = 'kontext' | 'gptimage';


export interface KontextParams {
  model: 'kontext';
  prompt: string;
  imageUrl: string;
  width?: number;
  height?: number;
  seed?: number;
  nologo?: boolean;
}


export interface GPTImageParams {
  model: 'gptimage';
  prompt: string;
  imageUrls: string[];
  width?: number;
  height?: number;
  seed?: number;
  nologo?: boolean;
}


export type TransformationParams = KontextParams | GPTImageParams;

export const DEFAULT_TRANSFORMATION_SETTINGS = {
  width: 1024,
  height: 1024,
  nologo: true,
  referer : 'com.ismafly.promptexploratorapp',
  //referer: 'com.ismafly.reimagine',
} as const;


export const TRANSFORMATION_MODELS = [
  {
    id: 'kontext' as const,
    name: 'Kontext',
    description: 'Transform a single image',
    imageCount: 1,
    maxImages: 1,
  },
  {
    id: 'gptimage' as const,
    name: 'GPT Image',
    description: 'Mix 2-4 images together',
    imageCount: { min: 2, max: 4 },
    maxImages: 4,
  },
] as const;