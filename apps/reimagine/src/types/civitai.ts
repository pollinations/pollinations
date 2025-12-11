// Civitai API Type Definitions
export interface CivitaiImage {
  id: number;
  url: string;
  hash: string;
  width: number;
  height: number;
  nsfw: boolean;
  nsfwLevel: 'None' | 'Soft' | 'Mature' | 'X';
  createdAt: string;
  postId: number;
  stats: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
  meta: {
    Size?: string;
    seed?: number;
    Model?: string;
    steps?: number;
    prompt?: string;
    sampler?: string;
    cfgScale?: number;
    'Clip skip'?: string;
    'Hires upscale'?: string;
    'Hires upscaler'?: string;
    negativePrompt?: string;
    'Denoising strength'?: string;
    [key: string]: any; // For additional dynamic metadata
  } | null;
  username: string;
}

export interface CivitaiImagesResponse {
  items: CivitaiImage[];
  metadata: {
    nextCursor?: number;
    currentPage?: number;
    pageSize?: number;
    nextPage?: string;
  };
}

export interface CivitaiModel {
  id: number;
  name: string;
  description: string;
  type: 'Checkpoint' | 'TextualInversion' | 'Hypernetwork' | 'AestheticGradient' | 'LORA' | 'Controlnet' | 'Poses';
  nsfw: boolean;
  tags: string[];
  creator: {
    username: string;
    image: string | null;
  };
  stats: {
    downloadCount: number;
    favoriteCount: number;
    commentCount: number;
    ratingCount: number;
    rating: number;
  };
}

// API Request Parameters
export interface CivitaiImagesParams {
  limit?: number;
  postId?: number;
  modelId?: number;
  modelVersionId?: number;
  username?: string;
  nsfw?: boolean | 'None' | 'Soft' | 'Mature' | 'X';
  sort?: 'Most Reactions' | 'Most Comments' | 'Newest';
  period?: 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
  page?: number;
}

// UI Filter Types
export type TrendingSort = 'Most Reactions' | 'Most Comments' | 'Newest';
export type TrendingPeriod = 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
export type NSFWFilter = 'None' | 'Soft' | 'Mature' | 'X' | 'All';

export interface TrendingFilters {
  sort: TrendingSort;
  period: TrendingPeriod;
  nsfw: NSFWFilter;
  modelId?: number;
}

export interface LexicaImage {
  id: string;
  promptid: string;
  width: number;
  height: number;
  upscaled_width: number | null;
  upscaled_height: number | null;
  userid: string;
  model_mode: string | null;
  raw_mode: boolean;
  variationForImageUrl: string | null;
  image_prompt_strength: number | null;
}
export interface LexicaPrompt {
  id: string;
  prompt: string;
  negativePrompt: string;
  timestamp: string;
  grid: boolean;
  seed: string;
  c: number;
  model: string;
  width: number;
  height: number;
  initImage: string | null;
  initImageStrength: number | null;
  is_private: boolean;
  cleanedPrompt: string | null;
  images: LexicaImage[];
}
// Extended LexicaPrompt to include optional Civitai fields
export interface ExtendedLexicaPrompt extends LexicaPrompt {
  // Civitai specific fields (optional)
  civitaiImageUrl?: string;
  username?: string;
  stats?: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
}

export interface CivitaiPrompt {
  id: string;
  prompt: string;
  negativePrompt: string;
  timestamp: string;
  grid: boolean;
  seed: string;
  c: number;
  model: string;
  width: number;
  height: number;
  initImage: string | null;
  initImageStrength: number | null;
  is_private: boolean;
  cleanedPrompt: string | null;
  images: Array<{
    id: string;
    promptid: string;
    width: number;
    height: number;
    upscaled_width: number | null;
    upscaled_height: number | null;
    userid: string;
    model_mode: string | null;
    raw_mode: boolean;
    variationForImageUrl: string | null;
    image_prompt_strength: number | null;
    url?: string; // Store URL for Civitai images
  }>;
  // Civitai specific fields
  username?: string;
  stats?: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
  civitaiImageUrl?: string; // Store original Civitai image URL
}

// Helper function to convert Civitai image to Lexica-compatible format
export const convertCivitaiToLexicaFormat = (civitaiImage: CivitaiImage, preferredWidth?: number): CivitaiPrompt => {
  console.log('Converting Civitai image:', { 
    id: civitaiImage.id, 
    url: civitaiImage.url,
    preferredWidth
  });


  let finalImageUrl = civitaiImage.url.replace(/\/original=true/g, '');
  
  if (preferredWidth) {
    if (civitaiImage.url.includes('width=')) {
      finalImageUrl = civitaiImage.url.replace(/width=\d+/, `width=${preferredWidth}`);
    } else {
      finalImageUrl = `${civitaiImage.url}/width=${preferredWidth}`;
    }
  }
    
  console.log('Original URL:', civitaiImage.url);
  console.log('Final URL used:', finalImageUrl);

  return {
    id: civitaiImage.id.toString(),
    prompt: civitaiImage.meta?.prompt || 'No prompt available',
    negativePrompt: civitaiImage.meta?.negativePrompt || '',
    timestamp: civitaiImage.createdAt,
    grid: false,
    seed: civitaiImage.meta?.seed?.toString() || '',
    c: civitaiImage.meta?.cfgScale || 7,
    model: civitaiImage.meta?.Model || 'Unknown',
    width: civitaiImage.width,
    height: civitaiImage.height,
    initImage: null,
    initImageStrength: null,
    is_private: false,
    cleanedPrompt: null,
    images: [{
      id: civitaiImage.id.toString(),
      promptid: civitaiImage.id.toString(),
      width: civitaiImage.width,
      height: civitaiImage.height,
      upscaled_width: null,
      upscaled_height: null,
      userid: civitaiImage.username,
      model_mode: null,
      raw_mode: false,
      variationForImageUrl: null,
      image_prompt_strength: null,
      url: finalImageUrl,
    }],
    username: civitaiImage.username,
    stats: civitaiImage.stats,
    civitaiImageUrl: finalImageUrl,
  };
};