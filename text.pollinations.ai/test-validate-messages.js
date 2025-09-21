import { validateAndNormalizeMessages } from './textGenerationUtils.js';

console.log('Testing validateAndNormalizeMessages with system message...');

const testMessages = [
    {
        role: 'system',
        content: 'You are ChickyTutor, a helpful language tutor.'
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
    });
} catch (error) {
    console.error('Error:', error.message);
}
