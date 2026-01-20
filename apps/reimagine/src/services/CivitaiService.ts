import axios from 'axios';
import { 
  CivitaiImagesResponse, 
  CivitaiImagesParams, 
  CivitaiImage, 
  TrendingFilters 
} from '../types/civitai';

const CIVITAI_BASE_URL = 'https://civitai.com/api/v1';

export class CivitaiService {
  private static instance: CivitaiService;
  private readonly baseURL = CIVITAI_BASE_URL;

  static getInstance(): CivitaiService {
    if (!CivitaiService.instance) {
      CivitaiService.instance = new CivitaiService();
    }
    return CivitaiService.instance;
  }

  async getTrendingImages(
    filters: TrendingFilters,
    page: number = 1,
    limit: number = 100,
    cursor?: number
  ): Promise<CivitaiImagesResponse> {
    try {
      const params: any = {
        limit,
        sort: filters.sort,
        period: filters.period,
      };

      if (cursor) {
        console.log('Using cursor pagination:', cursor);
        params.cursor = cursor;
      } else if (page > 1) {
        params.page = page;
        console.log('Using page-based pagination:', page);
      }
  
      // Handle NSFW filtering
      if (filters.nsfw !== 'All') {
        if (filters.nsfw === 'None') {
          params.nsfw = false;
        } else {
          params.nsfw = filters.nsfw;
        }
      }
  
      // Add model filtering if specified
      if (filters.modelId) {
        params.modelId = filters.modelId;
      }
  
      console.log('Final API request params:', params);
  
      const response = await axios.get<CivitaiImagesResponse>(
        `${this.baseURL}/images`,
        { 
          params,
          timeout: 10000,
        }
      );
  
      console.log('API response received:', {
        itemsLength: response.data.items?.length || 0,
        metadata: response.data.metadata,
        firstItemId: response.data.items?.[0]?.id,
        lastItemId: response.data.items?.[response.data.items?.length - 1]?.id
      });
  
      return response.data;
    } catch (error) {
      console.error('Error fetching trending images:', error);
      throw this.handleError(error);
    }
  }  



  /**
   * Handle API errors consistently
   */
  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error status
        const message = error.response.data?.message || 'Server error occurred';
        return new Error(`Civitai API Error: ${message}`);
      } else if (error.request) {
        // Network error
        return new Error('Network error: Unable to connect to Civitai');
      }
    }
    
    // Generic error
    return new Error('An unexpected error occurred while fetching data');
  }

  /**
   * Get image URL for display (with size optimization)
   */
  getImageUrl(image: CivitaiImage, width?: number): string {

    let optimizedUrl = image.url.replace(/\/original=true/g, '');

    if (optimizedUrl.includes('.mp4') || optimizedUrl.includes('.webm') || optimizedUrl.includes('.mov')) {
      console.log('Detected video URL, converting to image:', optimizedUrl);
    
      const parts = optimizedUrl.split('/');
      const baseUrl = parts.slice(0, 3).join('/');
      const imageId = parts[3]; // xG1nkqKTMzGDvpLrqFT7WA
      const subId = parts[4]; // c4811c3f-1bce-471c-8f7c-ea20c6d73c98
      const filename = parts[parts.length - 2]; // c4811c3f-...mp4
      const baseFilename = filename.split('.')[0]; // c4811c3f-...

      const widthMatch = optimizedUrl.match(/width=(\d+)/);
      const existingWidth = widthMatch ? widthMatch[1] : '100';
    
      // new URL
      optimizedUrl = `${baseUrl}/${imageId}/${subId}/anim=false,transcode=true,optimized=true/${baseFilename}.jpeg/width=${existingWidth}`;
      console.log('Converted video URL to:', optimizedUrl);
    }
    
    if (width) {
      if (optimizedUrl.includes('width=')) {
        optimizedUrl = optimizedUrl.replace(/\/width=\d+/g, `/width=${width}`);
      } else {
        optimizedUrl = `${optimizedUrl}/width=${width}`;
      }
    }
    
    return optimizedUrl;
  }
}

// Export singleton instance
export const civitaiService = CivitaiService.getInstance();

// Also export the class for direct usage if needed
export default CivitaiService;