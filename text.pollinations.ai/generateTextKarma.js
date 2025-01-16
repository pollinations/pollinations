import axios from 'axios';
import dotenv from 'dotenv';
import debug from 'debug';

dotenv.config();

const { KARMA_ENDPOINT } = process.env
const log = debug('pollinations:karma');
const errorLog = debug('pollinations:karma:error');

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
      max_tokens: 1024,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KARMA_API_KEY}`
      }
    });
    log("karma response", response.data);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 400 && error.response.data.status === 'Auth token must be passed as a header called Authorization') {
      errorLog('Authentication error: Invalid or missing Authorization header');
      throw new Error('Authentication failed: Please check your API key and ensure it\'s correctly set in the Authorization header');
    }
    errorLog('Error calling Karma API: %s', error.message);
    if (error.response && error.response.data && error.response.data.error) {
      errorLog('Error details: %O', error.response.data.error);
    }
    throw error;
  }
}

function hasSystemMessage(messages) {
  return messages.some(message => message.role === 'system');
}

export default generateTextKarma;
