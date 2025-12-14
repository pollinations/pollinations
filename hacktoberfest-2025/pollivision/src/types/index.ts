export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  videoUrl?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'error';
  progress?: number;
}

export interface VideoGeneration {
  id: string;
  prompt: string;
  status: 'queued' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: Date;
  completedAt?: Date;
  pollenCost: number;
}

export interface UserCredits {
  balance: number;
  totalSpent: number;
  totalGenerated: number;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  pollenAmount: number;
  popular?: boolean;
  features: string[];
}

export interface VideoModel {
  id: string;
  name: string;
  description: string;
  pollenPerSecond: number;
  outputCostPerMillion: number | null;
  quality: 'standard' | 'high' | 'ultra';
  speed: 'fast' | 'medium' | 'slow';
  icon: string;
  recommended?: boolean;
}

export interface AppSettings {
  apiKey: string;
  theme: 'dark' | 'light';
  autoSave: boolean;
  quality: 'standard' | 'high' | 'ultra';
  selectedVideoModel: string;
  videoDuration: number;
}



