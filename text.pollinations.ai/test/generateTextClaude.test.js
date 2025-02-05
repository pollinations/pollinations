import test from 'ava';
import sinon from 'sinon';
import { generateTextClaude } from '../generateTextClaude.js';

test.beforeEach(t => {
  t.context.sandbox = sinon.createSandbox();
});

test.afterEach.always(t => {
  t.context.sandbox.restore();
});

test('generateTextClaude should return valid response', async t => {
  const mockResponse = {
    content: [{ text: 'Claude response' }]
  };
  
  const stub = t.context.sandbox.stub(global, 'fetch')
    .resolves(new Response(JSON.stringify(mockResponse)));

  const result = await generateTextClaude({
    messages: [{ role: 'user', content: 'Hi Claude' }],
    model: 'claude-2'
  });

  t.is(result.content, 'Claude response');
  t.true(stub.calledOnce);
});

test('generateTextClaude should handle incomplete responses', async t => {
  const stub = t.context.sandbox.stub(global, 'fetch')
    .resolves(new Response(JSON.stringify({})));

  const error = await t.throwsAsync(() => generateTextClaude({
    messages: [{ role: 'user', content: 'Hello' }]
  }));

  t.regex(error.message, /Invalid response format/);
  t.true(stub.calledOnce);
});
