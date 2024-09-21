# 🌸 Pollinations Generative React Hooks & Components 🌸

A simple way to generate images, text and markdown using the Pollinations API in your React projects.

## 🚀 Quick Start

Install the package:

    npm install @pollinations/react

## 🧩 Components

### PollinationsText

The PollinationsText component simplifies the process of generating and displaying plain text using Pollinations' API.

    import React from 'react';
    import { PollinationsText } from '@pollinations/react';

    const MyComponent = () => (
      <PollinationsText seed={42} model="mistral" systemPrompt="You are a helpful assistant.">
        Write out Pollinations.AI terms and conditions in Chinese
      </PollinationsText>
    );

    export default MyComponent;

### PollinationsMarkdown

The PollinationsMarkdown component simplifies the process of generating and displaying markdown text using Pollinations' API.

    import React from 'react';
    import { PollinationsMarkdown } from '@pollinations/react';

    const RobotDocumentation = () => (
      <PollinationsMarkdown seed={42} model="openai" systemPrompt="You are a technical writer.">
        Create beautiful documentation about a Pollinating robot in markdown
      </PollinationsMarkdown>
    );

    export default RobotDocumentation;

### PollinationsImage

The PollinationsImage component simplifies the process of generating and displaying images using Pollinations' API.

    import React from 'react';
    import { PollinationsImage } from '@pollinations/react';

    const MyComponent = () => (
      <PollinationsImage prompt="A beautiful sunset over the ocean" width={800} height={600} seed={42} />
    );

    export default MyComponent;

## 🛠️ Hooks

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

## 📜 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Made with ❤️ by the Pollinations.AI team