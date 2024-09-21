# @pollinations/react Documentation

Welcome to the **@pollinations/react** library! This repository offers an interactive, real-time preview for three essential React components, allowing users to test and customize them effortlessly.

## 🧩 Components

- **`<PollinationsText />`**: Generates and displays text based on user prompts.
- **`<PollinationsImage />`**: Creates images using specified parameters.
- **`<PollinationsMarkdown />`**: Renders markdown content from user inputs.

## 🛠️ Hooks

- **`usePollinationsImage`**: The hook allows you to generate image
- **`usePollinationsText`**: The hook allows you to generate text
- **`usePollinationsChat`**: The hook allows you to generate chat

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

Here’s a refined and organized version of the **Features** and **TODO** sections:

---

## Features

- **Real-time Component Previews**: Instantly see the effects of your changes with live component and hook previews.
- **Responsive Design**: Optimized for all devices, ensuring a seamless experience whether on desktop, tablet, or mobile.
- **Dynamic Model Updates**: Automatically fetches and updates the list of available models in real-time.
- **Effortless Copy & Paste**: Easily copy code snippets or content to quickly test and integrate in your projects.

---

## TODO

- [X] Implement real-time updates for available models.
- [X] Allow model selection for text generation.
- [X] Enable image size selection functionality.
- [X] Provide seed selection options.
- [X] Add model selection for image generation.
- [X] Implement a complete dark/light mode toggle.
- [X] Add a "Copy Code" button for easy code copying.
- [X] Improve markdown rendering for better result visualization.
- [X] Create comprehensive documentation for hooks.
- [X] Add preview functionality in the hooks documentation.
- [ ] Add `onChange` functionality with debounce for better performance.
- [ ] Document all parameters for components and hooks.
- [ ] Introduce loading indicators for asynchronous actions.
- [ ] Enhance documentation to cover all possible parameters.
- [ ] Incorporate pollinations.ai’s visual CSS styling pattern into the documentation.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 💡 Learn More

- Explore the [Pollinations Generative React Hooks & Components](https://www.npmjs.com/package/@pollinations/react) on npm.
- Try the [Chatbot example](https://karma.pollinations.ai) to see more of what the project offers.
- Discover the [Storytelling example](https://storytelling.karma.yt/) for creative applications.
- Learn more about the project at [Pollinations.ai](https://pollinations.ai/readme).

### Made with ❤️ by the [Pollinations.ai](https://pollinations.ai) Team & [Karma.yt](https://karma.yt)
