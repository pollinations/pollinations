import { validateAndNormalizeMessages } from './textGenerationUtils.js';
import chickyTutorPrompt from './personas/chickytutor.js';

console.log('Testing validateAndNormalizeMessages with ChickyTutor prompt...');
console.log('ChickyTutor prompt length:', chickyTutorPrompt.length);

const testMessages = [
    {
        role: 'system',
        content: chickyTutorPrompt
    },
    {
        role: 'user', 
        content: 'Hello, who are you?'
    }
];

console.log('Input messages:', testMessages.length);
testMessages.forEach((msg, i) => {
    console.log(`  ${i}: role=${msg.role}, contentLength=${msg.content?.length || 0}`);
});

try {
    const result = validateAndNormalizeMessages(testMessages);
    console.log('Output messages:', result.length);
    result.forEach((msg, i) => {
        console.log(`  ${i}: role=${msg.role}, contentLength=${msg.content?.length || 0}`);
        if (msg.role === 'system') {
            console.log(`  System message starts with: "${msg.content.substring(0, 100)}..."`);
        }
    });
} catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
}
