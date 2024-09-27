# 🌸 Pollinations Generative React Hooks 🌸

A simple way to generate images, text and markdown using the Pollinations API in your React projects.

## 🚀 Quick Start

For interactive example code and documentation, visit [Pollinations React Hooks](https://react-hooks.pollinations.ai).

Install the package:

    npm install @pollinations/react

## 🛠️ Hooks

### usePollinationsText

The usePollinationsText hook allows you to generate text from Pollinations' API and use it directly in your React components.

    import React from 'react';
    import { usePollinationsText } from '@pollinations/react';

    const HaikuComponent = () => {
      const text = usePollinationsText('Write a short haiku about Pollinations.AI', { 
        seed: 42,
        model: 'mistral',
        systemPrompt: 'You are a poetic AI assistant.'
      });
      
      return (
        <div>
          {text ? <p>{text}</p> : <p>Loading...</p>}
        </div>
      );
    };

    export default HaikuComponent;

#### Options

- `seed` (number, default: -1): The seed for random text generation. If -1, a random seed will be used.
- `model` (string, default: 'openai'): The model to use for text generation. Options: 'openai', 'mistral'.
- `systemPrompt` (string, optional): A system prompt to set the behavior of the AI.

### usePollinationsImage

The usePollinationsImage hook allows you to generate image URLs from Pollinations' API and use them directly in your React components.

    import React from 'react';
    import { usePollinationsImage } from '@pollinations/react';

    const SunsetImageComponent = () => {
      const imageUrl = usePollinationsImage('A beautiful sunset over the ocean', {
        width: 800,
        height: 600,
        seed: 42,
        model: 'turbo',
        nologo: true,
        enhance: false
      });

      return (
        <div>
          {imageUrl ? <img src={imageUrl} alt="Generated sunset" /> : <p>Loading...</p>}
        </div>
      );
    };

    export default SunsetImageComponent;

#### Options

- `width` (number, default: 1024): The width of the generated image.
- `height` (number, default: 1024): The height of the generated image.
- `model` (string, default: 'turbo'): The model to use for image generation.
- `seed` (number, default: -1): The seed for random image generation. If -1, a random seed will be used.
- `nologo` (boolean, default: true): Whether to generate the image without a logo.
- `enhance` (boolean, default: false): Whether to enhance the generated image.

### usePollinationsChat

The usePollinationsChat hook allows you to generate chat responses from Pollinations' API and use them directly in your React components.

    import React, { useState } from 'react';
    import { usePollinationsChat } from '@pollinations/react';

    const ChatComponent = () => {
      const [input, setInput] = useState('');
      const { sendUserMessage, messages } = usePollinationsChat([
        { role: "system", content: "You are a helpful assistant" }
      ], { 
        seed: 42, 
        jsonMode: false,
        model: 'mistral'
      });

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

#### Options

- `seed` (number, default: 42): The seed for random text generation.
- `jsonMode` (boolean, default: false): Whether to parse the response as JSON.
- `model` (string, default: 'openai'): The model to use for text generation. Options: 'openai', 'mistral'.

### Markdown Example

Here's an example of how to use the `usePollinationsText` hook to generate and render markdown content:

    import React from 'react';
    import { usePollinationsText } from '@pollinations/react';
    import ReactMarkdown from 'react-markdown';

    const MarkdownExample = () => {
      const markdownContent = usePollinationsText('Create a guide on pollination techniques', {
        seed: 42,
        model: 'openai',
        systemPrompt: 'You are a technical writer specializing in biology. Responding always in Markdown format.'
      });

      return (
        <div>
          {markdownContent ? (
            <ReactMarkdown>{markdownContent}</ReactMarkdown>
          ) : (
            <p>Loading markdown content...</p>
          )}
        </div>
      );
    };

    export default MarkdownExample;

Note: This example uses `react-markdown` to render the markdown content. You'll need to install it separately:

    npm install react-markdown

## 📜 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Made with ❤️ by the Pollinations.AI team