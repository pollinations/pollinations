import axios from 'axios';
import { 
  BannedImagesResponse, 
  BannedImage 
} from '../types/reporting';
import Constants from "expo-constants";

export const getConfig = () => {
  const { BANNED_IMAGES_URL } = Constants.expoConfig.extra;
  return { BANNED_IMAGES_URL };
};

class BannedImagesService {
  private static readonly BANNED_IMAGES_URL = getConfig().BANNED_IMAGES_URL;
  private static readonly REQUEST_TIMEOUT = 10000;

  private static bannedImagesSet: Set<string> | null = null;
  private static isLoading = false;
  private static isInitialized = false;

  /**
   * Initialize the service et load list images banned (once)
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized || this.isLoading) {
      console.log('🚫 BannedImagesService already initialized or loading');
      return;
    }

    try {
      this.isLoading = true;
      console.log('🚫 Initializing BannedImagesService...');

      await this.fetchFromServer();
      this.isInitialized = true;
      console.log('🚫 BannedImagesService initialized successfully');

    } catch (error) {
      console.error('🚫 Error initializing BannedImagesService:', error);
      
      // in case of errer, initialize with empty Set
      this.bannedImagesSet = new Set();
      this.isInitialized = true;
      console.log('🚫 Initialized with empty set due to error');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * get the list of banned images
   */
  private static async fetchFromServer(): Promise<void> {
    try {
      const randomParam = Math.random().toString(36).substring(7);
      const urlWithParam = `${this.BANNED_IMAGES_URL}?t=${randomParam}`;

      console.log('🚫 Fetching banned images from:', urlWithParam);

      const response = await axios.get<BannedImagesResponse>(urlWithParam, {
        timeout: this.REQUEST_TIMEOUT,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      console.log('🚫 Successfully fetched banned images from server');
      console.log('🚫 Banned images count:', response.data.images?.length || 0);

      // update
      this.updateBannedImagesSet(response.data.images || []);

    } catch (error) {
      console.error('🚫 Error fetching from server:', error);
      throw error;
    }
  }

  /**
   * set BannedId in memory
   */
  private static updateBannedImagesSet(bannedImages: BannedImage[]): void {
    this.bannedImagesSet = new Set(
      bannedImages.map(img => img.id)
    );
    
    console.log('🚫 Updated banned images set with', this.bannedImagesSet.size, 'images');

    if (this.bannedImagesSet.size > 0) {
      const firstFew = Array.from(this.bannedImagesSet).slice(0, 3);
      console.log('🚫 Sample banned IDs:', firstFew);
    }
  }

  /**
   * check if image id is a banned image
   */
  static async isImageBanned(imageId: string): Promise<boolean> {

    if (!this.isInitialized && !this.isLoading) {
      console.log('🚫 Service not initialized, initializing now...');
      await this.initialize();
    }

    while (this.isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const isBanned = this.bannedImagesSet?.has(imageId) || false;
    
    if (isBanned) {
      console.log('🚫 Image is banned:', imageId);
    }
    
    return isBanned;
  }


  static getBannedImagesCount(): number {
    return this.bannedImagesSet?.size || 0;
  }


  static async forceRefresh(): Promise<void> {
    console.log('🚫 Force refreshing banned images...');
    this.isInitialized = false;
    this.bannedImagesSet = null;
    await this.initialize();
  }

  static isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  static getStats(): {
    isInitialized: boolean;
    isLoading: boolean;
    bannedImagesCount: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      bannedImagesCount: this.getBannedImagesCount(),
    };
  }
}

export default BannedImagesService;