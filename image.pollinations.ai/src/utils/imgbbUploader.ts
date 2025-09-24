import { Buffer } from 'buffer';

/**
 * Interface for imgbb API response
 */
interface ImgbbResponse {
  data: {
    url: string;
    delete_url?: string;
    display_url?: string;
  };
  success: boolean;
  status: number;
}

/**
 * Interface for imgbb API error response
 */
interface ImgbbErrorResponse {
  error: {
    message: string;
    status_code: number;
  };
  success: boolean;
  status: number;
}

/**
 * Uploads an image buffer to imgbb and returns the permanent URL
 *
 * @param imageBuffer - The image buffer to upload
 * @param resolution - The resolution string in format "widthxheight" for logging purposes
 * @returns Promise<string> - The permanent image URL from imgbb
 * @throws Error if upload fails or API returns an error
 */
export async function uploadToImgbb(imageBuffer: Buffer, resolution: string): Promise<string> {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error('IMGBB_API_KEY environment variable is not set');
  }

  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');

    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('image', base64Image);

    // Make API request
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as ImgbbResponse | ImgbbErrorResponse;

    // Check for API-level errors
    if (!result.success) {
      const errorResponse = result as ImgbbErrorResponse;
      throw new Error(
        `Imgbb API error: ${errorResponse.error.message} (status: ${errorResponse.error.status_code})`
      );
    }

    const successResponse = result as ImgbbResponse;

    if (!successResponse.data.url) {
      throw new Error('Imgbb API response missing URL in data field');
    }

    console.log(`Successfully uploaded image to imgbb for resolution ${resolution}`);
    return successResponse.data.url;

  } catch (error) {
    console.error(`Failed to upload image to imgbb for resolution ${resolution}:`, error);

    if (error instanceof Error) {
      throw new Error(`Imgbb upload failed for resolution ${resolution}: ${error.message}`);
    } else {
      throw new Error(`Imgbb upload failed for resolution ${resolution}: Unknown error`);
    }
  }
}