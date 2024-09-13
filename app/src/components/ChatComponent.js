import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
    const [input, setInput] = useState('');
    const { sendUserMessage, messages } = usePollinationsChat([{ "role": "system", content: "You are a helpful assistant" }], {});

    const handleSend = () => {
        sendUserMessage(input);
        setInput('');
    };

    return (
        <div>
            <div>
                {messages.map((msg, index) => (
                    <p key={index}><strong>{msg.role}:</strong> {msg.content}</p>
                ))}
            </div>
            <input value={input} onChange={(e) => setInput(e.target.value)} />
            <button onClick={handleSend}>Send</button>
        </div>
    );
};

export default ChatComponent;
