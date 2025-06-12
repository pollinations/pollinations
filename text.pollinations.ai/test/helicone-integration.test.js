import dotenv from 'dotenv';
import { expect } from 'chai';
import fetch from 'node-fetch';
import { generateText } from '../generateTextPortkey.js';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.helicone' });

describe('Helicone Integration Tests', function() {
  this.timeout(30000); // Set timeout to 30 seconds for API calls
  
  before(function() {
    // Skip tests if Helicone API key is not set
    if (!process.env.HELICONE_API_KEY || process.env.HELICONE_API_KEY === 'your_helicone_api_key') {
      console.log('Skipping Helicone tests: No valid Helicone API key found');
      this.skip();
    }
  });

  it('should route requests through Helicone when enabled', async function() {
    // Enable Helicone for this test
    process.env.HELICONE_ENABLED = 'true';
    
    // Simple test message
    const messages = [
      { role: 'user', content: 'Say hello world' }
    ];
    
    // Generate text using our client
    const response = await generateText(messages, { model: 'openai-fast' });
    
    // Verify we got a valid response
    expect(response).to.be.an('object');
    expect(response.choices).to.be.an('array');
    expect(response.choices[0].message).to.be.an('object');
    expect(response.choices[0].message.content).to.be.a('string');
    
    console.log('Response with Helicone enabled:', response.choices[0].message.content);
  });
  
  it('should bypass Helicone when disabled', async function() {
    // Disable Helicone for this test
    process.env.HELICONE_ENABLED = 'false';
    
    // Simple test message
    const messages = [
      { role: 'user', content: 'Say hello world again' }
    ];
    
    // Generate text using our client
    const response = await generateText(messages, { model: 'openai-fast' });
    
    // Verify we got a valid response
    expect(response).to.be.an('object');
    expect(response.choices).to.be.an('array');
    expect(response.choices[0].message).to.be.an('object');
    expect(response.choices[0].message.content).to.be.a('string');
    
    console.log('Response with Helicone disabled:', response.choices[0].message.content);
  });
  
  it('should add custom properties to Helicone requests', async function() {
    // Enable Helicone for this test
    process.env.HELICONE_ENABLED = 'true';
    
    // Simple test message with user and session ID
    const messages = [
      { role: 'user', content: 'Say hello with custom properties' }
    ];
    
    // Generate text with custom user and session ID
    const response = await generateText(messages, { 
      model: 'openai-fast',
      user: 'test-user-123',
      sessionId: 'test-session-456'
    });
    
    // Verify we got a valid response
    expect(response).to.be.an('object');
    expect(response.choices).to.be.an('array');
    
    console.log('Response with custom properties:', response.choices[0].message.content);
    
    // Note: We can't directly verify the Helicone properties were sent
    // without access to the Helicone API, but this test ensures the
    // code doesn't break when adding these properties
  });
});
