# 🌸 Pollinations Generative React Hooks & Components 🌸

A simple way to generate images, text and markdown using the Pollinations API in your React projects.

## 🚀 Quick Start

Install the package:

```bash
npm install @pollinations/react
```

### 🛠️ Hook: usePollinationsText

The usePollinationsText hook allows you to generate text from Pollinations' API and use it directly in your React components.

```javascript
import React from 'react';
import { usePollinationsText } from '@pollinations/react;

const MyComponent = () => {
  const text = usePollinationsText('Describe a beautiful sunset over the ocean');
  
  return (
    <div>
      {text ? <p>{text}</p> : <p>Loading...</p>}
    </div>
  );
};

export default MyComponent;
```

### 🛠️ Hook: usePollinationsImage

The usePollinationsImage hook allows you to generate image URLs from Pollinations' API and use them directly in your React components.

```javascript
import React from 'react';
import { usePollinationsImage } from '@pollinations/react;

const MyComponent = () => {
  const imageUrl = usePollinationsImage('A beautiful sunset over the ocean', { width: 800, height: 600, seed: 42 });

  return (
    <div>
      {imageUrl ? <img src={imageUrl} /> : <p>Loading...</p>}
    </div>
  );
};

export default MyComponent;
```

### 🛠️ Hook: usePollinationsChat

The usePollinationsChat hook allows you to generate chat responses from Pollinations' API and use them directly in your React components.

```javascript
import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([ {"role":"system", content:"You are a helpful assistant"}]);

  const handleSend = () => {
    sendUserPrompt(input);
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

```

### 🧩 Components

#### PollinationsText

The PollinationsText component simplifies the process of generating and displaying plain text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsText } from '@pollinations/react;

const MyComponent = () => (
  <PollinationsText seed={42}>Describe a beautiful sunset over the ocean</PollinationsText>
);

export default MyComponent;
```

#### PollinationsMarkdown

The PollinationsMarkdown component simplifies the process of generating and displaying markdown text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsMarkdown } from '@pollinations/react;

const MyComponent = () => (
  <PollinationsMarkdown seed={42}>Describe a beautiful sunset over the ocean</PollinationsMarkdown>
);

export default MyComponent;
```

#### PollinationsImage

The PollinationsImage component simplifies the process of generating and displaying images using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsImage } from '@pollinations/react;

const MyComponent = () => (
  <PollinationsImage prompt="A beautiful sunset over the ocean" width={800} height={600} seed={42} />
);

export default MyComponent;
```

## ⚙️ Development

1. Clone the repository:

```bash
git clone https://github.com/your-username/pollinations-react.git
cd pollinations-react
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Publish the package:

```bash
npm publish --access public
```

## 📜 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

Made with ❤️ by the Pollinations.AI team
