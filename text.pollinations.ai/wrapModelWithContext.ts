// TODO: Figure out the type of `options` & Fix the type of generatorFunction
function generateTextContextWrapper(systemMessage: string, generatorFunction: Function, overrideModelName?: string) {
    return async function (messages: Conversation, options: TextRequestData) {
        // Remove any existing system messages
        const filteredMessages = messages.filter((message: { role: string }) => message.role !== 'system')
        // Add the system message to the beginning of the messages array
        const messagesWithSystem = [
            { role: 'system', content: systemMessage },
            ...filteredMessages
        ]
        // Call the provided generator function with the modified messages

        return generatorFunction(messagesWithSystem, { ...options, model: overrideModelName ?? options.model })
    }
}

export default generateTextContextWrapper