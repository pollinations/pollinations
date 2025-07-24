// Check available models at MonoAI
import fetch from 'node-fetch';

const checkModels = async () => {
  try {
    const endpoint = 'https://chatgpt.loves-being-a.dev/v1/models';
    const apiKey = 'sk-0dcc1483bb584c5bb6796664';
    
    console.log('Checking available models...');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Available models:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('Error checking models:', error.message);
    throw error;
  }
};

// Execute the check
checkModels()
  .then(() => console.log('Models check completed'))
  .catch(() => console.log('Models check failed'));
