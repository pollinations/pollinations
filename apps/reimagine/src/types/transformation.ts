
import { PollinationsModel } from './pollinations';
import { ImageSource } from './imageSelection';


export interface TransformationVersion {
  id: string;
  versionNumber: number;        // 1, 2, 3...
  prompt: string;
  resultUrl: string;
  model: PollinationsModel;
  params: {
    width: number;
    height: number;
    seed?: number;
    nologo: boolean;
  };
  timestamp: string;
  favorite?: boolean;
}

export interface TransformationChain {
  id: string;
  sourceImages: ImageSource[];  // Images sources (1-4)
  versions: TransformationVersion[];
  currentVersionId: string;     // ID of version
  createdAt: string;
  updatedAt: string;
}


export interface TransformationResult {
  success: boolean;
  imageUrl?: string;
  model: PollinationsModel;
  error?: string;
}

export type TransformationStatus = 'idle' | 'preparing' | 'uploading' | 'transforming' | 'success' | 'error';