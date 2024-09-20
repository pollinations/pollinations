# @pollinations/react Documentation

Welcome to the **@pollinations/react** library! This repository offers an interactive, real-time preview for three essential React components, allowing users to test and customize them effortlessly.

## 🧩 Components

- **`<PollinationsText />`**: Generates and displays text based on user prompts.
- **`<PollinationsImage />`**: Creates images using specified parameters.
- **`<PollinationsMarkdown />`**: Renders markdown content from user inputs.

## 🛠️ Hooks

- **`usePollinationsImage`**: A custom hook for managing image generation.
- **`usePollinationsText`**: A custom hook for handling text generation.

### Component Overview

Each component section on the documentation page includes:

1. A clear title and description.
2. An input field for entering prompts.
3. A code block that displays the generated code based on user input.
4. A real-time preview of the component with the provided prompt.

## Getting Started

Follow these steps to set up the project locally:

1. **Clone this repository:**
   ```bash
   git clone https://github.com/diogo-karma/pollinations-react-doc
   cd pollinations-react-doc
   ```

2. **Install the necessary dependencies:**
   ```bash
   npm install # or pnpm install, bun install, or yarn
   ```

3. **Run the project:**
   ```bash
   npm run dev # or pnpm dev, bun dev, or yarn dev
   ```

4. **Open the documentation page:**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser to see the app in action. You can modify the code by editing the `app/page.tsx` file, with changes reflecting in real-time.

## Features

- **Real-time code and component previews**: See changes as you make them.
- **Responsive design**: Seamless viewing experience on any device.

## TODO

- [X] Implement real-time updates with available models.
- [ ] Add onChange with debounce
- [x] Allow model selection for Text Generative.
- [x] Enable selection of image size.
- [x] Provide seed selection functionality.
- [X] Add model selection for Image.
- [ ] Implement a complete dark/light mode toggle.
- [X] Add a "Copy Code" button for easy code copying.
- [ ] Document the parameters for each component.
- [ ] Improve markdown result rendering.
- [ ] Introduce loading indicators for modifications.
- [ ] Create documentation for hooks.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 💡 Learn More

- Explore the [Pollinations Generative React Hooks & Components](https://www.npmjs.com/package/@pollinations/react) on npm.
- Try the [Chatbot example](https://karma.pollinations.ai) to see more of what the project offers.
- Discover the [Storytelling example](https://storytelling.karma.yt/) for creative applications.
- Learn more about the project at [Pollinations.ai](https://pollinations.ai/readme).

### Made with ❤️ by the [Pollinations.ai](https://pollinations.ai) Team
