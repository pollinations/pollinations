# 🌸 Pollinations Generative React Hooks & Components 🌸

A simple way to generate images, text, and markdown using the Pollinations API in your React projects.

## 🚀 Quick Start

Install the package using your preferred package manager:

```bash
# Using npm
npm install @pollinations/react

# Using yarn
yarn add @pollinations/react

# Using pnpm
pnpm add @pollinations/react

# Using bun
bun add @pollinations/react
```

## 🌟 Example Application: Karma

Check out Karma, an open-source application built with Next.js that demonstrates the power of Pollinations React components:

- 📂 GitHub Repository: [https://github.com/pollinations/karma](https://github.com/pollinations/karma)
- 🌐 Live Demo: [https://karma.pollinations.ai/](https://karma.pollinations.ai/)

Karma showcases how to use Pollinations React components to create an interactive and dynamic web application. It's a great resource for learning how to integrate and use these components in a real-world project.

## 🌍 Multi-Language Support

All components and hooks support multiple languages! You can generate content in any language by simply providing prompts in the desired language.

## 🧩 Components

### 🖼️ PollinationsImage

The PollinationsImage component simplifies the process of generating and displaying images using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsImage } from '@pollinations/react';

const MyComponent = () => (
  <PollinationsImage 
    prompt="A beautiful sunset over the ocean" 
    width={800} 
    height={600} 
    seed={42} 
    alt="Generated sunset"
    model="flux-realism"
  />
);

export default MyComponent;
```

#### 🎨 Supported Image Generation Models

Pollinations supports various image generation models. You can specify the model using the `model` prop. Some of the supported models include:

- 'flux'
- 'flux-realism'
- 'any-dark'
- 'flux-anime'
- 'flux-3d'
- 'turbo' (default)

⚠️ Note: The available models may change over time. Always refer to the official [Pollinations.AI website](https://pollinations.ai) for the most up-to-date list of supported models and their capabilities.

### 📝 PollinationsText

The PollinationsText component simplifies the process of generating and displaying plain text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsText } from '@pollinations/react';

const MyComponent = () => (
  <PollinationsText seed={42}>Write out Pollinations.AI terms and conditions in English</PollinationsText>
);

export default MyComponent;
```

### 📊 PollinationsMarkdown

The PollinationsMarkdown component simplifies the process of generating and displaying markdown text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsMarkdown } from '@pollinations/react';

const RobotDocumentation = () => (
  <PollinationsMarkdown seed={42}>Create beautiful documentation about a Pollinating robot in markdown</PollinationsMarkdown>
);

export default RobotDocumentation;
```

## 🛠️ Hooks

### 🖼️ usePollinationsImage

The usePollinationsImage hook allows you to generate image URLs from Pollinations' API and use them directly in your React components.

```javascript
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const SunsetImageComponent = () => {
  const imageUrl = usePollinationsImage('A beautiful sunset over the ocean', {
    width: 800,
    height: 600,
    seed: 42,
    model: 'flux-realism',
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
```

#### ⚙️ Options

- `width` (number, default: 1024): The width of the generated image.
- `height` (number, default: 1024): The height of the generated image.
- `model` (string, default: 'turbo'): The model to use for image generation. See the list of supported models above.
- `seed` (number, default: -1): The seed for random image generation. If -1, a random seed will be used.
- `nologo` (boolean, default: true): Whether to generate the image without a logo.
- `enhance` (boolean, default: false): Whether to enhance the generated image.

### 📝 usePollinationsText

The usePollinationsText hook allows you to generate text from Pollinations' API and use it directly in your React components.

```javascript
import React from 'react';
import { usePollinationsText } from '@pollinations/react';

const HaikuComponent = () => {
  const text = usePollinationsText('Write a short haiku about Pollinations.AI', 42);
  
  return (
    <div>
      {text ? <p>{text}</p> : <p>Loading...</p>}
    </div>
  );
};

export default HaikuComponent;
```

#### ⚙️ Options

- `seed` (number, default: -1): The seed for random text generation. If -1, a random seed will be used.

### 💬 usePollinationsChat

The usePollinationsChat hook allows you to generate chat responses from Pollinations' API and use them directly in your React components.

```javascript
import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "You are a helpful assistant" }
  ], { seed: 42, jsonMode: false });

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
```

#### ⚙️ Options

- `seed` (number, default: 42): The seed for random text generation.
- `jsonMode` (boolean, default: false): Whether to parse the response as JSON.

## 🆕 New Features

### 🔗 isLink Option for PollinationsImage

The `isLink` property allows the image to be clickable, opening the image URL in a new tab:

- `isLink={true}`: The image becomes a clickable link to the image URL.
- `isLink={false}` (default): The image is displayed normally, without being clickable.

Example usage:

```javascript
<PollinationsImage 
  prompt="A beautiful sunset"
  isLink={true}
  alt="Clickable sunset image"
/>
```

## 📜 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Made with ❤️ by the Pollinations.AI team