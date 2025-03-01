const axios = require('axios');

async function generateImage(prompt, model = 'sdxl') {
  if (!process.env.IMAGE_API_URL) {
    throw new Error('Image API URL not configured');
  }

  try {
    const response = await axios.post(process.env.IMAGE_API_URL, {
      prompt,
      model,
      num_images: 1,
      safety_check: true
    }, {
      timeout: 120000, // 2 minute timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) {
      throw new Error('Empty response from image service');
    }

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    if (!response.data.images || !response.data.images[0]) {
      throw new Error('No image generated');
    }

    return response.data.images[0];
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      throw new Error(error.response.data.error || 'Server error');
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response from image service');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw error;
    }
  }
}

module.exports = {
  generateImage
};