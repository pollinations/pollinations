import test from 'ava';
import sinon from 'sinon';
import { generateTextOpenAI } from '../generateTextOpenai.js';

test.beforeEach(t => {
  t.context.sandbox = sinon.createSandbox();
});

test.afterEach.always(t => {
  t.context.sandbox.restore();
});

test('generateTextOpenAI should handle successful response', async t => {
  const mockResponse = {
    choices: [{ message: { content: 'Test response' } }]
  };
  
  const stub = t.context.sandbox.stub(global, 'fetch')
    .resolves(new Response(JSON.stringify(mockResponse)));

  const result = await generateTextOpenAI({
    messages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-3.5-turbo'
  });

  t.is(result.content, 'Test response');
  t.true(stub.calledOnce);
});

test('generateTextOpenAI should handle API errors', async t => {
  const stub = t.context.sandbox.stub(global, 'fetch')
    .resolves(new Response(null, { status: 429 }));

  const error = await t.throwsAsync(() => generateTextOpenAI({
    messages: [{ role: 'user', content: 'Hello' }]
  }));

  t.is(error.message, 'OpenAI API Error: 429');
  t.true(stub.calledOnce);
});
