import generateTextClaude from './generateTextClaude.js';

function generateTextClaudeWrapper(systemMessage) {
    return async function (messages, options) {
        // Add the system message to the beginning of the messages array
        const messagesWithSystem = [
            { role: 'system', content: systemMessage },
            ...messages
        ];

        // Call the original generateTextClaude function with the modified messages
        return generateTextClaude(messagesWithSystem, options);
    };
}

export default generateTextClaudeWrapper;
