import fetch from 'node-fetch';

async function testMistralDirect() {
  try {
    console.log('Testing Mistral model directly...');
    
    const response = await fetch(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/light-depot-447020-j3/locations/us-central1/publishers/mistralai/models/mistral-small-2503:rawPredict',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ya29.a0AeXRPp7U9A_RPslgnlOewiYkh_Vp47W-pMxMEgiuIc6Mu8cUHL2D1OGXPgwy33nNyhpmjK6YQ_cXrEAMvo9K5mWluFCgXf1cb75JJUqpD96HAy7F5EvenivVW36wMhxVW1f3HFrJkfhJp2fecjP6AB0mOvPy7xbjHKxXoJt3ddlWDAaCgYKAcwSARMSFQHGX2Mii7TvS0ga21rSp5y3VNzUqQ0181'
        },
        body: JSON.stringify({
          model: 'mistral-small-2503',
          messages: [
            { role: 'user', content: 'Hello, can you tell me about yourself?' }
          ]
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing Mistral model directly:', error);
  }
}

testMistralDirect();
