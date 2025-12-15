import * as ImagePicker from 'expo-image-picker';
import Constants from "expo-constants";

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface ImgBBResponse {
  data: {
    id: string;
    title: string;
    url_viewer: string;
    url: string;
    display_url: string;
    width: number;
    height: number;
    size: number;
    time: number;
    expiration: number;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    thumb: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    delete_url: string;
  };
  success: boolean;
  status: number;
}

export const getConfig = () => {
  const { IMGBB_API_KEY } = Constants.expoConfig.extra;
  return { IMGBB_API_KEY };
};

export class ImageUploadService {

  private static get IMGBB_API_KEY(): string {
    const apiKey = Constants.expoConfig?.extra?.IMGBB_API_KEY;
    if (!apiKey) {
      console.error('❌ IMGBB_API_KEY not found in expo config, using fallback');
      return 'xxxxxxxxxxxxxxxxxxxxxxx';
    }
    return apiKey;
  }

  private static get IMGBB_UPLOAD_URL(): string {
    return `https://api.imgbb.com/1/upload?key=${this.IMGBB_API_KEY}`;
  }

  /**
   * Complete flow: select and upload image to ImgBB
   */
  static async selectAndUploadImage(): Promise<UploadResult> {
    try {
      console.log('🚀 Starting image selection...');

      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return {
          success: false,
          error: 'Camera roll permission is required'
        };
      }

      // Select image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return {
          success: false,
          error: 'No image selected'
        };
      }

      const selectedImage = result.assets[0];
      console.log('📷 Image selected:', {
        uri: selectedImage.uri,
        width: selectedImage.width,
        height: selectedImage.height,
        fileSize: selectedImage.fileSize
      });

      // Upload to ImgBB
      return await this.uploadToImgBB(selectedImage.uri);
    } catch (error) {
      console.error('❌ Error in selectAndUploadImage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process image'
      };
    }
  }

  /**
   * Upload to ImgBB - MÉTHODE PUBLIQUE pour ReImagine
   * Reproduit exactement ce qui marche dans Postman
   */
  static async uploadToImgBB(imageUri: string): Promise<UploadResult> {
    try {
      console.log('📡 Uploading to ImgBB...');
      console.log('📡 Using API URL:', this.IMGBB_UPLOAD_URL);
      console.log('📡 Image URI:', imageUri);

      // Generate filename with proper extension
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const filename = `image_${timestamp}_${randomStr}.jpg`;

      // Create FormData
      const formData = new FormData();
      // In React Native, we need to create a file-like object
      const fileObject = {
        uri: imageUri,
        type: 'image/jpeg',
        name: filename,
      };

      formData.append('image', fileObject as any, filename);

      console.log('📤 Uploading file:', filename);
      console.log('📤 File object:', fileObject);

      const requestOptions = {
        method: 'POST',
        body: formData,
      };

      console.log('📤 Sending request...');
      const uploadResponse = await fetch(this.IMGBB_UPLOAD_URL, requestOptions);

      console.log('📊 Response status:', uploadResponse.status);
      console.log('📊 Response headers:', Object.fromEntries(uploadResponse.headers.entries()));

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('📊 Error response body:', errorText);
        throw new Error(`ImgBB upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. Response: ${errorText}`);
      }

      const responseText = await uploadResponse.text();
      console.log('📊 Raw response text:', responseText);

      let responseJson: ImgBBResponse;
      try {
        responseJson = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse JSON response:', parseError);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      console.log('📊 Parsed response:', JSON.stringify(responseJson, null, 2));

      if (!responseJson.success || !responseJson.data) {
        throw new Error('ImgBB upload failed: Invalid response format');
      }

      const imageUrl = responseJson.data.display_url;

      console.log('✅ ImgBB upload successful!');
      console.log('🎯 Display URL:', imageUrl);
      console.log('📋 Image details:', {
        id: responseJson.data.id,
        size: responseJson.data.size,
        dimensions: `${responseJson.data.width}x${responseJson.data.height}`,
        expiration: responseJson.data.expiration
      });

      // Validate URL format
      if (!imageUrl || !imageUrl.startsWith('https://')) {
        throw new Error(`Invalid URL received from ImgBB: "${imageUrl}"`);
      }

      // Test if the URL is accessible
      try {
        const testResponse = await fetch(imageUrl, { method: 'HEAD' });
        if (!testResponse.ok) {
          console.warn('⚠️ Uploaded image URL not immediately accessible, but proceeding...');
        } else {
          console.log('✅ Image URL is accessible');
        }
      } catch (testError) {
        console.warn('⚠️ Could not test image URL accessibility:', testError);
      }

      return {
        success: true,
        url: imageUrl
      };
    } catch (error) {
      console.error('❌ ImgBB upload error:', error);

      // Return more detailed error information
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  /**
   * Validate if URL is accessible (optional helper)
   */
  static async validateImageUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (error) {
      console.error('URL validation failed:', error);
      return false;
    }
  }

  /**
   * Set API key dynamically (if needed)
   */
  static setApiKey(apiKey: string): void {
    (this as any).IMGBB_API_KEY = apiKey;
    (this as any).IMGBB_UPLOAD_URL = `https://api.imgbb.com/1/upload?key=${apiKey}`;
  }
}

export default ImageUploadService;