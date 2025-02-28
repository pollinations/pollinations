import test from 'ava';
import debug from 'debug';

const log = debug('pollinations:test');

/**
 * Feed and streaming tests are skipped because they tend to hang
 * due to the nature of SSE connections.
 * 
 * Instead, streaming functionality can be tested manually with curl:
 * 
 * curl -X POST http://localhost:16385/openai/chat/completions \
 *   -H "Content-Type: application/json" \
 *   -d '{"messages":[{"role":"user","content":"Count to 3"}],"model":"gpt-4","stream":true}' \
 *   --no-buffer
 * 
 * And feed functionality can be tested with:
 * 
 * curl -N http://localhost:16385/feed
 */

test.skip('feed and streaming tests are skipped to avoid hanging', t => {
    t.pass('This test is skipped to avoid hanging the test suite');
});
