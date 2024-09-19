import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const { sendUserMessage, messages } = usePollinationsChat([
        { "role": "system", content: "You are an image description generator" }
    ], {});

    const handleSend = () => {
        const messageData = [
            {
                "type": "text",
                "text": input
            }, {
                "type": "image_url",
                "image_url": { "url": image }
            }
        ];
        sendUserMessage(messageData);
        setInput('');
        setImage(null);
    };

    const handleImageUpload = (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onloadend = () => {
            setImage(reader.result);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div>
            <div>
                {messages.map((msg, index) => (
                    <p key={index}><strong>{msg.role}:</strong> <pre>{JSON.stringify(msg.content)}</pre></p>
                ))}
            </div>
            <input value={input} onChange={(e) => setInput(e.target.value)} />
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            <button onClick={handleSend}>Send</button>
        </div>
    );
};

export default ChatComponent;
