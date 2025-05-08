function generateTextContextWrapper(systemMessage, generatorFunction, overrideModelName=null) {
    return async function (messages, options) {
        // Extract any existing system messages
        const systemMessages = messages.filter(message => message.role === 'system');
        const filteredMessages = messages.filter(message => message.role !== 'system');

        // Determine the final system message content
        let finalSystemContent = systemMessage;

        // If there's an existing system message, append it to the preset system message with two newlines
        if (systemMessages.length > 0) {
            finalSystemContent = `${systemMessage}\n\n${systemMessages[0].content}`;
        }

        // Add the system message to the beginning of the messages array
        const messagesWithSystem = [
            { role: 'system', content: finalSystemContent },
            ...filteredMessages
        ];

        // Call the provided generator function with the modified messages
        return generatorFunction(messagesWithSystem, {...options, model: overrideModelName || options.model});
    };
}

export default generateTextContextWrapper;
