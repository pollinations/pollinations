import test from 'ava';
import { processReferralLinks } from '../referralLinks.js';
import debug from 'debug';

const log = debug('pollinations:test:referral');

// Store original Math.random
const originalRandom = Math.random;

test.beforeEach(t => {
    t.timeout(30000); // 30 seconds timeout for API calls
    // Force referral link processing by setting random to always return 0
    Math.random = () => 0;
});

test.afterEach(() => {
    // Restore original Math.random
    Math.random = originalRandom;
});

test('Integration: processReferralLinks should ignore non-markdown content', async t => {
    const plainText = 'This is just plain text without any markdown formatting.';
    const result = await processReferralLinks(plainText);
    t.is(result, plainText, 'Should return plain text unchanged');
});

test('Integration: processReferralLinks should process product mentions', async t => {
    const content = `# Product Review
Here's my review of the MacBook Pro M2. It's an excellent laptop for developers.
The battery life is amazing and the performance is outstanding.`;

    const result = await processReferralLinks(content);
    
    t.true(result.includes('pollinations.ai/referral?topic='), 'Should add at least one referral link');
    t.true(result.includes('MacBook'), 'Should preserve product mention');
    t.true(result.includes('# Product Review'), 'Should preserve markdown formatting');
});

test('Integration: processReferralLinks should handle category-based content', async t => {
    const content = `# Guide to Organic Tea
Learn about the wonderful world of organic tea. From green tea to black tea,
there are many varieties to explore. Each type offers unique health benefits.`;

    const result = await processReferralLinks(content);
    
    t.true(result.includes('pollinations.ai/referral?topic='), 'Should add at least one referral link');
    t.true(result.includes('organic tea'), 'Should preserve category mention');
    t.true(result.includes('# Guide'), 'Should preserve markdown formatting');
});

test('Integration: processReferralLinks should preserve complex markdown', async t => {
    const content = `# Advanced Markdown Test
## Subheading
- List item 1
- List item 2

> This is a blockquote
\`\`\`javascript
const code = 'example';
\`\`\`

**Bold text** and *italic text*`;

    const result = await processReferralLinks(content);
    
    t.true(result.includes('# Advanced'), 'Should preserve h1');
    t.true(result.includes('## Subheading'), 'Should preserve h2');
    t.true(result.includes('- List'), 'Should preserve lists');
    t.true(result.includes('> This'), 'Should preserve blockquotes');
    t.true(result.includes('```javascript'), 'Should preserve code blocks');
    t.true(result.includes('**Bold'), 'Should preserve bold formatting');
    t.true(result.includes('*italic'), 'Should preserve italic formatting');
});

test('Integration: processReferralLinks should respect link limit', async t => {
    const content = `# Shopping Guide
1. Check out the MacBook Pro
2. Consider the iPhone 15
3. Look at the iPad Pro
4. Try the AirPods Max
5. Get the Apple Watch`;

    const result = await processReferralLinks(content);
    const linkCount = (result.match(/pollinations\.ai\/referral\?topic=/g) || []).length;
    
    t.true(linkCount <= 3, 'Should not add more than 3 referral links');
    t.true(result.includes('# Shopping Guide'), 'Should preserve original content');
});

test('Integration: processReferralLinks should respect probability', async t => {
    const content = `# Test Content
This is some test content with a product mention.`;

    // Force skip with Math.random = 1
    Math.random = () => 1;
    const skippedResult = await processReferralLinks(content);
    t.is(skippedResult, content, 'Should return original content when probability check fails');

    // Force process with Math.random = 0
    Math.random = () => 0;
    const processedResult = await processReferralLinks(content);
    t.not(processedResult, content, 'Should process content when probability check passes');
});
