import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';
import debug from 'debug';

const log = debug('pollinations:modal');

dotenv.config();

const MODAL_API_KEY = process.env.HORMOZ_MODAL_KEY;

const modelMapping = {
    'hormoz':'Hormoz-8B'
};

// Validate API key is present
if (!MODAL_API_KEY) {
    log('Error: HORMOZ_MODAL_KEY environment variable is not set');
    throw new Error('Modal API key is not configured');
}

// Mess

// Create Modal text generator instance with custom error handling
export const generateTextModal = createTextGenerator({
    endpoint: 'https://pollinations--hormoz-serve.modal.run/v1/chat/completions',
    apiKey: MODAL_API_KEY,
    modelMapping,
    customHeaders: {
        'X-Request-Source': 'pollinations-text'
    }
});
