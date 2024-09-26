import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { KARMA_ENDPOINT } = process.env

async function generateTextKarma(messages, { jsonMode = false }) {

  // const stringifiedMessages = JSON.stringify(messages);
  // if (stringifiedMessages.length > 5000) {
  //   throw new Error('Input messages exceed the character limit of 5000.');
  // }

  if (jsonMode && !hasSystemMessage(messages)) {
    // TODO: Karma jsonMode
    messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
  }

  try {
    const response = await axios.post(KARMA_ENDPOINT, {
      messages,
      max_tokens: 400,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KARMA_API_KEY}`
      }
    });
    console.log("karma response", response.data);
    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response && error.response.status === 400 && error.response.data.status === 'Auth token must be passed as a header called Authorization') {
      console.error('Authentication error: Invalid or missing Authorization header');
      throw new Error('Authentication failed: Please check your API key and ensure it\'s correctly set in the Authorization header');
    }
    console.error('Error calling Karma API:', error.message);
    if (error.response && error.response.data && error.response.data.error) {
      console.error('Error details:', error.response.data.error);
    }
    throw error;
  }
}

function hasSystemMessage(messages) {
  return messages.some(message => message.role === 'system');
}

export default generateTextKarma;
