import { findModelByName } from './availableModels.js';

console.log('Testing findModelByName...');

// Test chickytutor
const chickytutor = findModelByName('chickytutor');
console.log('chickytutor found:', !!chickytutor);
console.log('chickytutor name:', chickytutor?.name);
console.log('chickytutor has config:', !!chickytutor?.config);
console.log('chickytutor config type:', typeof chickytutor?.config);

// Test openai-large
const openaiLarge = findModelByName('openai-large');
console.log('openai-large found:', !!openaiLarge);
console.log('openai-large name:', openaiLarge?.name);
console.log('openai-large has config:', !!openaiLarge?.config);
console.log('openai-large config type:', typeof openaiLarge?.config);

// Test bidara
const bidara = findModelByName('bidara');
console.log('bidara found:', !!bidara);
console.log('bidara name:', bidara?.name);
console.log('bidara has config:', !!bidara?.config);
console.log('bidara config type:', typeof bidara?.config);
