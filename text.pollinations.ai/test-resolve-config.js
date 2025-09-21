import { resolveModelConfig } from './utils/modelResolver.js';

console.log('Testing resolveModelConfig...');

const messages = [{ role: 'user', content: 'Hello' }];
const options = { model: 'chickytutor' };

try {
    const result = resolveModelConfig(messages, options);
    console.log('Success! Result keys:', Object.keys(result));
    console.log('Options keys:', Object.keys(result.options));
    console.log('modelDef exists:', !!result.options.modelDef);
    console.log('modelConfig exists:', !!result.options.modelConfig);
} catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
}
