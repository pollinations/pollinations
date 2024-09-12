# @pollinations/react

A React library for integrating Pollinations components into your application.

## Installation

To install the package, use npm:

```bash
npm install @pollinations/react
```

## Usage

### Hook

The `usePollinationsImage` hook allows you to generate images using Pollinations' API and use them in your React components.

```javascript
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const MyComponent = () => {
  const imageUrl = usePollinationsImage('A beautiful sunset over the ocean');
  
  return (
    <div>
      {imageUrl ? <img src={imageUrl} alt="Generated" /> : <p>Loading...</p>}
    </div>
  );
};

export default MyComponent;
```

### Component

The `PollinationsImage` component simplifies the process of generating and displaying images using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsImage } from '@pollinations/react';

const MyComponent = () => (
  <PollinationsImage prompt="A beautiful sunset over the ocean" />
);

export default MyComponent;
```

## Components

### PollinationsImage

- **prompt**: The text prompt to generate the image.
- **width**: The width of the generated image.
- **height**: The height of the generated image.
- **seed**: The seed for random image generation.
- **model**: The model to use for image generation.
- **nologo**: Whether to generate the image without a logo.
- **enhance**: Whether to enhance the generated image.
- **alt**: The alt text for the image.

### PollinationsMarkdown

- **children**: The markdown content to render.
- **seed**: The seed for random text generation.

### PollinationsText

- **children**: The prompt to generate the text.
- **seed**: The seed for random text generation.

## Hooks

### usePollinationsImage

A hook to generate an image based on a given prompt and options.

#### Parameters

- **prompt**: The text prompt to generate the image.
- **options**: Optional parameters for image generation.
  - **width**: The width of the generated image.
  - **height**: The height of the generated image.
  - **model**: The model to use for image generation.
  - **seed**: The seed for random image generation.
  - **nologo**: Whether to generate the image without a logo.
  - **enhance**: Whether to enhance the generated image.

#### Returns

- **string**: The URL of the generated image.

### usePollinationsText

A hook to generate text based on a given prompt.

#### Parameters

- **prompt**: The text prompt to generate the text.
- **seed**: The seed for random text generation.

#### Returns

- **string**: The URL of the generated text.

## Development

### Local Development

To develop this package locally, follow these steps:

1. Clone the repository:

```bash
git clone https://github.com/your-username/pollinations-react.git
cd pollinations-react
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

### Publishing

To publish the package to npm, run:

```bash
npm publish --access public
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by the Pollinations.AI team