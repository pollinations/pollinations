const axios = require('axios');

async function generateText(message, model = 'gpt-3.5-turbo') {
  if (!process.env.TEXT_API_URL) {
    throw new Error('Text API URL not configured');
  }

  try {
    const response = await axios.post(process.env.TEXT_API_URL, {
      prompt: message,
      model,
      max_tokens: 500,
      temperature: 0.7,
      safety_check: true
    }, {
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) {
      throw new Error('Empty response from text service');
    }

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    if (!response.data.text) {
      throw new Error('No text generated');
    }

    return response.data.text;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      throw new Error(error.response.data.error || 'Server error');
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response from text service');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw error;
    }
  }
}

module.exports = {
  generateText
};