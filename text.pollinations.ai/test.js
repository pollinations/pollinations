import { generateText } from './generateTextPortkey.js';

// Set environment variables for testing
process.env.SCALEWAY_API_KEY = 'your-api-key';
process.env.SCALEWAY_BASE_URL = 'https://api.scaleway.com/v1';

async function test() {
    try {
        const response = await generateText([
            {
                role: "user",
                content: "Hello, how are you?"
            }
        ], {
            model: "mistral",
            temperature: 0.7
        });
        
        console.log('Response:', JSON.stringify(response, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
