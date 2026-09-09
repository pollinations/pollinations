import * as FileSystem from 'expo-file-system';
import { ImageSource, ImageValidationResult, IMAGE_CONSTRAINTS } from '../types/imageSelection';
import ImageUploadService from './ImageUploadService';

class ImagePreparationService {
  
  /**
   * Validate image locale
   */
  static async validateLocalImage(uri: string): Promise<ImageValidationResult> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        return {
          valid: false,
          error: 'File does not exist',
        };
      }

      const size = fileInfo.size || 0;
      if (size > IMAGE_CONSTRAINTS.MAX_SIZE_BYTES) {
        return {
          valid: false,
          error: `File too large. Maximum size is ${IMAGE_CONSTRAINTS.MAX_SIZE_BYTES / (1024 * 1024)}MB`,
          size,
        };
      }

      if (size === 0) {
        return {
          valid: false,
          error: 'File is empty',
        };
      }

      return {
        valid: true,
        size,
      };
      
    } catch (error) {
      console.error('Error validating image:', error);
      return {
        valid: false,
        error: 'Failed to validate image',
      };
    }
  }

  /**
   * prepare image for transformation
   * Upload local images to ImgBB
   */
  static async prepareImagesForTransformation(
    images: ImageSource[]
  ): Promise<{ success: boolean; imageUrls?: string[]; error?: string }> {
    try {
      console.log(`📸 Preparing ${images.length} images for transformation...`);

      const imageUrls: string[] = [];

      for (const image of images) {
        // Image Civitai : use url
        if (image.source === 'civitai' && image.url) {
          console.log(`✅ Civitai image: ${image.url}`);
          imageUrls.push(image.url);
          continue;
        }

        // Image locale : upload to ImgBB
        if (image.source === 'local' && image.localUri) {
          console.log(`📤 Uploading local image: ${image.id}`);
          
          // Validate before upload
          const validation = await this.validateLocalImage(image.localUri);
          if (!validation.valid) {
            throw new Error(validation.error || 'Invalid image');
          }

          // Upload to ImgBB
          console.log(`🔄 Calling ImageUploadService for: ${image.localUri}`);
          const uploadResult = await ImageUploadService.uploadToImgBB(image.localUri);
          
          if (uploadResult.success && uploadResult.url) {
            console.log(`✅ Upload success: ${uploadResult.url}`);
            
            // wait until image is uploaded
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            imageUrls.push(uploadResult.url);
          } else {
            throw new Error(uploadResult.error || 'Upload failed');
          }
          continue;
        }

        if (image.url) {
          imageUrls.push(image.url);
          continue;
        }

        throw new Error(`Invalid image source: ${image.id}`);
      }

      console.log(`✅ All images prepared: ${imageUrls.length} URLs`);

      return {
        success: true,
        imageUrls,
      };

    } catch (error) {
      console.error('❌ Error preparing images:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare images',
      };
    }
  }

  /**
   * Validate selection before transformation
   */
  static validateSelection(images: ImageSource[]): { valid: boolean; error?: string } {
    if (images.length === 0) {
      return {
        valid: false,
        error: 'No images selected',
      };
    }

    if (images.length > IMAGE_CONSTRAINTS.MAX_SELECTION) {
      return {
        valid: false,
        error: `Maximum ${IMAGE_CONSTRAINTS.MAX_SELECTION} images allowed`,
      };
    }

    return { valid: true };
  }

  /**
   * choise the right model depending number of images
   */
  static determineModel(imageCount: number): 'kontext' | 'gptimage' | null {
    if (imageCount === 1) return 'kontext';
    if (imageCount >= 2 && imageCount <= 4) return 'gptimage';
    return null;
  }
}

export default ImagePreparationService;