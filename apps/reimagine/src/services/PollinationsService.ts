/**
 * PollinationsService.ts - ReImagine Version
 * Service for transformation images with Pollinations.ai
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from "expo-constants";

export type TransformationModel = 'kontext' | 'gptimage';

export interface TransformationParams {
  prompt: string;
  model: TransformationModel;
  imageUrls: string[];
  width?: number;
  height?: number;
  nologo?: boolean;
  seed?: number;
  enhance?: boolean;
}

export interface TransformationResult {
  id: string;
  imageUrl: string;
  params: TransformationParams;
  timestamp: string;
}

interface RateLimitData {
  lastRequestTime: number;
  dailyUsage: {
    date: string;
    count: number;
  };
}


interface SimpleRateLimitSettings {
  cooldownSeconds: number;
  maxGenerationsPerDay: number;
}


const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai/prompt';
const RATE_LIMIT_KEY = 'reimagine_rate_limit';

// Fallback values
const FALLBACK_RATE_LIMIT: SimpleRateLimitSettings = {
  cooldownSeconds: 60,
  maxGenerationsPerDay: 5,
};


export const getConfig = () => {
  const { APP_REFERER, COOLDOWN_SECONDS, MAX_GENERATIONS_PER_DAY } = Constants.expoConfig?.extra || {};
  return {
    APP_REFERER,
    COOLDOWN_SECONDS,
    MAX_GENERATIONS_PER_DAY
  };
};


export class PollinationsTransformationService {
  private static instance: PollinationsTransformationService;

  private static get rateLimit(): SimpleRateLimitSettings {
    const cooldownSeconds = Number(Constants.expoConfig?.extra?.COOLDOWN_SECONDS);
    const maxGenerationsPerDay = Number(Constants.expoConfig?.extra?.MAX_GENERATIONS_PER_DAY);

    return {
      cooldownSeconds: isNaN(cooldownSeconds) ? FALLBACK_RATE_LIMIT.cooldownSeconds : cooldownSeconds,
      maxGenerationsPerDay: isNaN(maxGenerationsPerDay) ? FALLBACK_RATE_LIMIT.maxGenerationsPerDay : maxGenerationsPerDay
    };
  }

  private static get referer(): string {
    const referer = Constants.expoConfig?.extra?.APP_REFERER;
    if (!referer) {
      console.error('❌ APP_REFERER not found in expo config, using fallback');
      return 'com.ismafly.reimagine';
    }
    return referer;
  }

  static getInstance(): PollinationsTransformationService {
    if (!PollinationsTransformationService.instance) {
      PollinationsTransformationService.instance = new PollinationsTransformationService();
    }
    return PollinationsTransformationService.instance;
  }


  private getTodayString(): string {
    const today = new Date();
    return today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
  }


  private async loadRateLimitData(): Promise<RateLimitData> {
    try {
      const rateLimitJson = await AsyncStorage.getItem(RATE_LIMIT_KEY);

      if (rateLimitJson) {
        const data = JSON.parse(rateLimitJson);

        if (data && typeof data.lastRequestTime === 'number' && data.dailyUsage) {
          return data;
        }
      }
    } catch (error) {
      console.error('Error loading rate limit data:', error);
    }

    return {
      lastRequestTime: 0,
      dailyUsage: {
        date: this.getTodayString(),
        count: 0,
      },
    };
  }


  private async saveRateLimitData(data: RateLimitData): Promise<void> {
    try {
      await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving rate limit data:', error);
    }
  }


  async checkRateLimit(): Promise<{ allowed: boolean; waitTime?: number; reason?: string }> {
    try {
      const rateLimitData = await this.loadRateLimitData();
      const now = Date.now();
      const today = this.getTodayString();

      const rateLimit = PollinationsTransformationService.rateLimit;

      const timeSinceLastRequest = now - rateLimitData.lastRequestTime;
      const cooldownMs = rateLimit.cooldownSeconds * 1000;

      if (timeSinceLastRequest < cooldownMs) {
        const waitTime = Math.ceil((cooldownMs - timeSinceLastRequest) / 1000);
        return {
          allowed: false,
          waitTime,
          reason: `Please wait ${waitTime} seconds before transforming again`,
        };
      }

      // Check daily limit
      let dailyCount = 0;
      if (rateLimitData.dailyUsage.date === today) {
        dailyCount = rateLimitData.dailyUsage.count;
      }

      if (dailyCount >= rateLimit.maxGenerationsPerDay) {
        return {
          allowed: false,
          reason: `You've reached your daily limit of ${rateLimit.maxGenerationsPerDay} transformations. Try again tomorrow!`,
        };
      }

      console.log('✅ Rate limit check passed:', {
        dailyCount,
        maxDaily: rateLimit.maxGenerationsPerDay,
        timeSinceLastRequest: Math.round(timeSinceLastRequest / 1000),
        cooldownSeconds: rateLimit.cooldownSeconds,
      });

      return { allowed: true };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return { allowed: true };
    }
  }

  private async updateRateLimit(): Promise<void> {
    try {
      const rateLimitData = await this.loadRateLimitData();
      const now = Date.now();
      const today = this.getTodayString();

      const rateLimit = PollinationsTransformationService.rateLimit;

      rateLimitData.lastRequestTime = now;

      if (rateLimitData.dailyUsage.date === today) {
        rateLimitData.dailyUsage.count += 1;
      } else {
        rateLimitData.dailyUsage = {
          date: today,
          count: 1,
        };
      }

      await this.saveRateLimitData(rateLimitData);

      console.log('📊 Rate limit updated:', {
        date: today,
        dailyCount: rateLimitData.dailyUsage.count,
        maxDaily: rateLimit.maxGenerationsPerDay,
      });
    } catch (error) {
      console.error('Error updating rate limit:', error);
    }
  }

  async getRemainingGenerations(): Promise<number> {
    try {
      const rateLimitData = await this.loadRateLimitData();
      const today = this.getTodayString();

      const rateLimit = PollinationsTransformationService.rateLimit;

      let dailyCount = 0;
      if (rateLimitData.dailyUsage.date === today) {
        dailyCount = rateLimitData.dailyUsage.count;
      }

      const remaining = Math.max(0, rateLimit.maxGenerationsPerDay - dailyCount);

      console.log('📊 Remaining transformations:', {
        used: dailyCount,
        max: rateLimit.maxGenerationsPerDay,
        remaining,
        date: today,
      });

      return remaining;
    } catch (error) {
      console.error('Error getting remaining transformations:', error);
      return PollinationsTransformationService.rateLimit.maxGenerationsPerDay;
    }
  }

  async getWaitTime(): Promise<number> {
    const rateLimitCheck = await this.checkRateLimit();
    return rateLimitCheck.waitTime || 0;
  }


  private validateParams(params: TransformationParams): { valid: boolean; error?: string } {
    const { model, imageUrls, prompt } = params;

    if (!prompt || prompt.trim().length === 0) {
      return { valid: false, error: 'Prompt is required' };
    }

    if (!imageUrls || imageUrls.length === 0) {
      return { valid: false, error: 'At least one image is required' };
    }

    if (model === 'kontext' && imageUrls.length > 1) {
      return {
        valid: false,
        error: 'Kontext model only supports 1 image'
      };
    }

    if (model === 'gptimage' && imageUrls.length > 4) {
      return {
        valid: false,
        error: 'GPTImage model supports maximum 4 images'
      };
    }

    for (const url of imageUrls) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { valid: false, error: 'Invalid image URL format' };
      }
    }

    return { valid: true };
  }

  private buildTransformationUrl(params: TransformationParams): string {
    const {
      prompt,
      model,
      imageUrls,
      width,
      height,
      nologo = true,
      seed,
      enhance = false
    } = params;

    const encodedPrompt = encodeURIComponent(prompt);
    let url = `${POLLINATIONS_BASE_URL}/${encodedPrompt}/?model=${model}`;
    console.log("imageUrls :", imageUrls)

    url += `&referer=${PollinationsTransformationService.referer}`;

    if (nologo) {
      url += '&nologo=true';
    }

    const encodedImages = imageUrls.map(u => encodeURIComponent(u)).join(',');
    url += `&image=${encodedImages}`;

    if (width) {
      url += `&width=${width}`;
    }
    if (height) {
      url += `&height=${height}`;
    }
    if (seed) {
      url += `&seed=${seed}`;
    }
    if (enhance) {
      url += `&enhance=true`;
    }

    return url;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `reimagine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async transformImages(params: TransformationParams): Promise<TransformationResult> {
    console.log('🎨 Starting transformation with params:', params);

    // Validation
    const validation = this.validateParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check rate limit
    const rateLimitCheck = await this.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      throw new Error(rateLimitCheck.reason || 'Rate limit exceeded');
    }

    try {
      const imageUrl = this.buildTransformationUrl(params);

      console.log('🔗 Transformation URL:', imageUrl);

      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': PollinationsTransformationService.referer,
          'Accept': 'image/*,*/*;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });

      console.log('📊 Response status:', response.status);

      if (!response.ok) {
        let message = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const text = await response.text();
          const json = JSON.parse(text);
          message = json.message || message;

          // extraire sous-message si présent
          const inner = message.match(/"message":"([^"]+)"/);
          if (inner && inner[1]) {
            message = inner[1];
          }
        } catch (err) {
          console.warn('⚠️ Impossible de parser la réponse JSON d erreur');
        }

        throw new Error(message);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('❌ Generated URL did not return an image');
      }

      // Update rate limit
      await this.updateRateLimit();

      const result: TransformationResult = {
        id: this.generateId(),
        imageUrl,
        params,
        timestamp: new Date().toISOString(),
      };

      console.log('✅ Transformation successful:', result.id);
      return result;

    } catch (error) {
      console.error('❌ Transformation failed:', error);

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error('⏱️ Timeout: The transformation is taking too long.');
        } else if (error.message.includes('network')) {
          throw new Error('🌐 Network Error: Check your internet connection.');
        }
        throw error;
      }

      throw new Error('❌ Failed to transform image');
    }
  }
}

export const pollinationsService = PollinationsTransformationService.getInstance();
export default PollinationsTransformationService;