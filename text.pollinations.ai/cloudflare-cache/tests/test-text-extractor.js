import assert from 'assert';
import { extractAndNormalizeSemanticText } from '../src/text-extractor.js';
import { 
    SEMANTIC_WEIGHTING_ENABLED, 
    RECENT_TURNS_COUNT, 
    HISTORY_SEPARATOR, 
    LATEST_EXCHANGE_START_TAG, 
    LATEST_EXCHANGE_END_TAG 
} from '../src/config.js';

function runTest(name, testFunction) {
  try {
    testFunction();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

// Mock messages for testing
const mockMessages1 = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'How are you?' },
  { role: 'assistant', content: 'I am doing great. How about you?' },
  { role: 'user', content: 'I am fine.' },
  { role: 'assistant', content: 'Glad to hear that.' },
];

runTest('should correctly apply weighting and tags to recent turns', () => {
  const fullHistory = [
    '[USER] Hello',
    '[ASSISTANT] Hi there!',
    '[USER] How are you?',
    '[ASSISTANT] I am doing great. How about you?',
    '[USER] I am fine.',
    '[ASSISTANT] Glad to hear that.',
  ].join('\n');

  const recentTurns = [
    '[USER] How are you?',
    '[ASSISTANT] I am doing great. How about you?',
    '[USER] I am fine.',
    '[ASSISTANT] Glad to hear that.',
  ].join(' ');

  const weightedInput = `${fullHistory}${HISTORY_SEPARATOR}${LATEST_EXCHANGE_START_TAG} ${recentTurns} ${LATEST_EXCHANGE_END_TAG}`;
  const expectedOutput = weightedInput.replace(/\s+/g, ' ').trim();

  // We call extractAndNormalizeSemanticText which internally calls extractFromMessages
  const result = extractAndNormalizeSemanticText(JSON.stringify({ messages: mockMessages1 }));

  assert.strictEqual(result, expectedOutput, 'The weighted output with tags does not match the expected string.');
});

runTest('should return only full history when weighting is disabled', () => {
    // This requires modifying how config is handled in text-extractor or passing it as an arg.
    // For now, this test assumes SEMANTIC_WEIGHTING_ENABLED is true as per config.
    // A more advanced test setup would mock the config.
    console.log('Skipping test for disabled weighting - requires config mocking.');
});

runTest('should handle empty messages array', () => {
    const result = extractAndNormalizeSemanticText(JSON.stringify({ messages: [] }));
    assert.strictEqual(result, '', 'Should return an empty string for empty messages array.');
});

runTest('should skip weighting for short conversations (≤ recent turn count)', () => {
    const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' }
    ];

    // With only 1 turn (≤ RECENT_TURNS_COUNT of 2), should NOT use weighting
    const expectedOutput = '[USER] First message [ASSISTANT] First response';

    const result = extractAndNormalizeSemanticText(JSON.stringify({ messages }));
    assert.strictEqual(result, expectedOutput, 'Should skip weighting for conversations with ≤ recent turn count.');
});

runTest('should apply weighting only when conversation has more turns than configured', () => {
    const messages = [
        { role: 'user', content: 'Turn 1 user' },
        { role: 'assistant', content: 'Turn 1 assistant' },
        { role: 'user', content: 'Turn 2 user' },
        { role: 'assistant', content: 'Turn 2 assistant' },
        { role: 'user', content: 'Turn 3 user' },
        { role: 'assistant', content: 'Turn 3 assistant' }
    ];

    // With 3 turns (> RECENT_TURNS_COUNT of 2), should use weighting
    const fullHistory = [
        '[USER] Turn 1 user',
        '[ASSISTANT] Turn 1 assistant',
        '[USER] Turn 2 user',
        '[ASSISTANT] Turn 2 assistant',
        '[USER] Turn 3 user',
        '[ASSISTANT] Turn 3 assistant'
    ].join('\n');

    // Should include exactly the last 2 turns (4 messages)
    const recentTurns = [
        '[USER] Turn 2 user',
        '[ASSISTANT] Turn 2 assistant',
        '[USER] Turn 3 user',
        '[ASSISTANT] Turn 3 assistant'
    ].join(' ');

    const weightedInput = `${fullHistory}${HISTORY_SEPARATOR}${LATEST_EXCHANGE_START_TAG} ${recentTurns} ${LATEST_EXCHANGE_END_TAG}`;
    const expectedOutput = weightedInput.replace(/\s+/g, ' ').trim();

    const result = extractAndNormalizeSemanticText(JSON.stringify({ messages }));
    assert.strictEqual(result, expectedOutput, 'Should apply weighting with exactly the configured number of recent turns.');
});


console.log('All text-extractor tests passed!');
