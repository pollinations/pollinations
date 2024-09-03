# @pollinations-react

A simple React package for generating images using Pollinations' API.

## Installation

```bash
npm install @pollinations-react
```

## Usage

### Hook

The `usePollinationsImage` hook allows you to generate images using Pollinations' API and use them in your React components.

```javascript
import React from 'react';
import { usePollinationsImage } from '@pollinations-react';

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
import { PollinationsImage } from '@pollinations-react';

const MyComponent = () => (
  <PollinationsImage prompt="A beautiful sunset over the ocean" />
);

export default MyComponent;
```

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