
function generateTextContextWrapper(systemMessage, generatorFunction, overrideModelName=null) {
    return async function (messages, options) {
        // Remove any existing system messages
        const filteredMessages = messages.filter(message => message.role !== 'system');
        // Add the system message to the beginning of the messages array
        const messagesWithSystem = [
            { role: 'system', content: systemMessage },
            ...filteredMessages
        ];
        // Call the provided generator function with the modified messages

        return generatorFunction(messagesWithSystem, {...options, model: overrideModelName || options.model});
    };
}

export default generateTextContextWrapper;
