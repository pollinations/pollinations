import test from 'ava';
import { createOpenAICompatibleClient } from '../genericOpenAIClient.js';
import debug from 'debug';

const log = debug('pollinations:test:deepseek-content-format');
const errorLog = debug('pollinations:test:deepseek-content-format:error');

// Mock response to simulate DeepSeek API behavior
const mockDeepSeekResponse = {
  id: 'mock-deepseek-1234',
  object: 'chat.completion',
  created: Date.now(),
  model: 'DeepSeek-V3-0324',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        reasoning_content: "This is a response from DeepSeek V3 model in reasoning_content field",
        content: null
      },
      finish_reason: 'stop'
    }
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30
  }
};

// Mock a fetch function that returns our mock response
async function mockFetch() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => mockDeepSeekResponse
  };
}

// Test for the DeepSeek content field fix
test('should move content from reasoning_content to content field', async t => {
  // Create a client with our mock fetch
  const client = createOpenAICompatibleClient({
    endpoint: 'https://mock-api.example.com',
    authHeaderName: 'Authorization',
    authHeaderValue: () => 'Bearer mock-token',
    modelMapping: { 'deepseek': 'DeepSeek-V3-0324' },
    providerName: 'DeepSeek',
    defaultOptions: { model: 'deepseek' }
  });

  // Replace the global fetch with our mock
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  try {
    // Call the client with mock messages
    const messages = [{ role: 'user', content: 'Hello' }];
    const response = await client(messages, { model: 'deepseek' });

    // Check that the content field has been populated with reasoning_content
    t.truthy(response.choices[0].message.content, 'Content field should be populated');
    t.is(
      response.choices[0].message.content,
      mockDeepSeekResponse.choices[0].message.reasoning_content,
      'Content should match reasoning_content'
    );
  } finally {
    // Restore the original fetch
    global.fetch = originalFetch;
  }
});
