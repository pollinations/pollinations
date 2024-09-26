import generateTextClaude from './generateTextClaude.js';

function generateTextContextWrapper(systemMessage, generatorFunction = generateTextClaude) {
    return async function (messages, options) {
        // Remove any existing system messages
        const filteredMessages = messages.filter(message => message.role !== 'system');
        // Add the system message to the beginning of the messages array
        const messagesWithSystem = [
            { role: 'system', content: systemMessage },
            ...filteredMessages
        ];
        console.log('calling wrapper with messages', messagesWithSystem);
        // Call the provided generator function with the modified messages

        return generatorFunction(messagesWithSystem, options);
    };
}

export default generateTextContextWrapper;
