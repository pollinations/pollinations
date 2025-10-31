import AsyncStorage from '@react-native-async-storage/async-storage';
import { LexicaPrompt, LexicaImage } from '../types/api';
import { CivitaiPrompt, ExtendedLexicaPrompt } from '../types/civitai';

export interface FavoriteItem {
  id: string;
  prompt: ExtendedLexicaPrompt; // Use extended type that includes Civitai fields
  selectedImageId: string;
  selectedImage: LexicaImage;
  dateAdded: string;
  // Add fields to identify source and store additional data
  source?: 'lexica' | 'civitai';
  civitaiImageUrl?: string; // Store original Civitai URL
  civitaiStats?: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
  username?: string; // Creator username for Civitai
}

const FAVORITES_KEY = 'lexica_favorites';

export class FavoritesService {
  static async getFavorites(): Promise<FavoriteItem[]> {
    try {
      const favoritesJson = await AsyncStorage.getItem(FAVORITES_KEY);
      const favorites = favoritesJson ? JSON.parse(favoritesJson) : [];
      return favorites;
    } catch (error) {
      console.error('Error getting favorites:', error);
      return [];
    }
  }

  static async addToFavorites(prompt: LexicaPrompt | CivitaiPrompt, selectedImage: LexicaImage): Promise<void> {
    try {
      const favorites = await this.getFavorites();      
      
      // Check if already in favorites (by prompt id and image id)
      const existingIndex = favorites.findIndex(
        fav => fav.prompt.id === prompt.id && fav.selectedImageId === selectedImage.id
      );
      
      if (existingIndex === -1) {
        // Determine if this is a Civitai image
        const isCivitai = 'civitaiImageUrl' in prompt || 'stats' in prompt;
        console.log('Is Civitai:', isCivitai);
        
        // Convert CivitaiPrompt to ExtendedLexicaPrompt format for storage consistency
        const extendedPrompt: ExtendedLexicaPrompt = isCivitai ? {
          id: prompt.id,
          prompt: prompt.prompt,
          negativePrompt: prompt.negativePrompt,
          timestamp: prompt.timestamp,
          grid: prompt.grid,
          seed: prompt.seed,
          c: prompt.c,
          model: prompt.model,
          width: prompt.width,
          height: prompt.height,
          initImage: prompt.initImage,
          initImageStrength: prompt.initImageStrength,
          is_private: prompt.is_private,
          cleanedPrompt: prompt.cleanedPrompt,
          images: prompt.images.map(img => ({
            id: img.id,
            promptid: img.promptid,
            width: img.width,
            height: img.height,
            upscaled_width: img.upscaled_width,
            upscaled_height: img.upscaled_height,
            userid: img.userid,
            model_mode: img.model_mode,
            raw_mode: img.raw_mode,
            variationForImageUrl: img.variationForImageUrl,
            image_prompt_strength: img.image_prompt_strength,
          })),
          civitaiImageUrl: (prompt as CivitaiPrompt).civitaiImageUrl,
          stats: (prompt as CivitaiPrompt).stats,
          username: (prompt as CivitaiPrompt).username,
        } : prompt as ExtendedLexicaPrompt;

        console.log('Extended prompt created:', {
          id: extendedPrompt.id,
          civitaiImageUrl: extendedPrompt.civitaiImageUrl,
          stats: extendedPrompt.stats,
          username: extendedPrompt.username,
        });

        const civitaiUrl = isCivitai ? (prompt as CivitaiPrompt).civitaiImageUrl : null;
        const civitaiStats = isCivitai ? (prompt as CivitaiPrompt).stats : null;
        const username = isCivitai ? (prompt as CivitaiPrompt).username : null;

        console.log('Storing Civitai data:', { civitaiUrl, civitaiStats, username });

        const newFavorite: FavoriteItem = {
          id: `${prompt.id}_${selectedImage.id}`,
          prompt: extendedPrompt,
          selectedImageId: selectedImage.id,
          selectedImage,
          dateAdded: new Date().toISOString(),
          source: isCivitai ? 'civitai' : 'lexica',
          // Store Civitai-specific data
          ...(isCivitai && {
            civitaiImageUrl: civitaiUrl,
            civitaiStats: civitaiStats,
            username: username,
          }),
        };

        console.log('Final favorite item:', JSON.stringify(newFavorite, null, 2));
        
        favorites.unshift(newFavorite); // Add to beginning
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        
        console.log('Successfully saved to favorites');
      } else {
        console.log('Item already in favorites');
      }
    } catch (error) {
      console.error('Error adding to favorites:', error);
      throw error;
    }
  }

  static async removeFromFavorites(promptId: string, imageId: string): Promise<void> {
    try {
      const favorites = await this.getFavorites();
      const updatedFavorites = favorites.filter(
        fav => !(fav.prompt.id === promptId && fav.selectedImageId === imageId)
      );
      
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updatedFavorites));
    } catch (error) {
      console.error('Error removing from favorites:', error);
      throw error;
    }
  }

  static async isFavorite(promptId: string, imageId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavorites();
      return favorites.some(
        fav => fav.prompt.id === promptId && fav.selectedImageId === imageId
      );
    } catch (error) {
      console.error('Error checking if favorite:', error);
      return false;
    }
  }

  static async clearAllFavorites(): Promise<void> {
    try {
      await AsyncStorage.removeItem(FAVORITES_KEY);
    } catch (error) {
      console.error('Error clearing favorites:', error);
      throw error;
    }
  }

  /**
   * Get the correct image URL for display in favorites
   */
  static getFavoriteImageUrl(favorite: FavoriteItem): string {
    if (favorite.source === 'civitai' && favorite.civitaiImageUrl) {
      return favorite.civitaiImageUrl;
    }
    // Default to Lexica format
    return `https://image.lexica.art/sm2/${favorite.selectedImageId}`;
  }

  /**
   * Get favorites filtered by source
   */
  static async getFavoritesBySource(source: 'lexica' | 'civitai'): Promise<FavoriteItem[]> {
    try {
      const allFavorites = await this.getFavorites();
      return allFavorites.filter(fav => fav.source === source);
    } catch (error) {
      console.error('Error getting favorites by source:', error);
      return [];
    }
  }
}