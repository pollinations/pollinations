export type ImageSourceType = 'civitai' | 'local';


export interface ImageSource {
  id: string;
  url?: string;              // URL si Civitai ou déjà uploadée sur ImgBB
  localUri?: string;         // URI local si image du device
  source: ImageSourceType;
  thumbnail: string;         // Pour preview dans le bottom bar
  needsUpload: boolean;      // true si local et pas encore uploadée
  width?: number;
  height?: number;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  size?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}


export const IMAGE_CONSTRAINTS = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,      // 5MB
  MAX_WIDTH: 4096,
  MAX_HEIGHT: 4096,
  MIN_WIDTH: 256,
  MIN_HEIGHT: 256,
  SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
  MAX_SELECTION: 4,
} as const;