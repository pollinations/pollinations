# 🌸 Pollinations Generative React Hooks & Components 🌸

A simple way to generate images, text and markdown using the Pollinations API in your React projects.

## 🚀 Quick Start

Install the package:

```bash
npm install @pollinations/react
```

### 🧩 Components

#### PollinationsText

The PollinationsText component simplifies the process of generating and displaying plain text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsText } from '@pollinations/react;

const TermsAndConditions = () => (
  <PollinationsText seed={42}>Write out Pollinations.AI terms and conditions in Chinese</PollinationsText>
);

export default TermsAndConditions;
```

#### PollinationsMarkdown

The PollinationsMarkdown component simplifies the process of generating and displaying markdown text using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsMarkdown } from '@pollinations/react;

const AdSlogan = () => (
  <PollinationsMarkdown seed={42}>Create great advertising slogan with cool formatting about Pollinating in markdown< PollinationsMarkdown>
);

export default AdSlogan;
```

#### PollinationsImage

The PollinationsImage component simplifies the process of generating and displaying images using Pollinations' API.

```javascript
import React from 'react';
import { PollinationsImage } from '@pollinations/react;

const SunsetImage = () => (
  <PollinationsImage prompt="A beautiful sunset over the ocean" width={800} height={600} seed={42} />
);

export default SunsetImage;
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
