# Pollinations.ai

This repository contains the source code for the Pollinations.ai web application, a dynamic platform for exploring and interacting with AI-generated content.

## How It Works

Pollinations.ai is a React-based web application built with Vite that serves as a rich client for AI content generation. The application provides a seamless experience for users to both view and create AI-generated images and text.

### Core Features

-   **Dual Content Feeds**: The heart of the application is its two primary feeds: one for AI-generated images and another for text. These feeds showcase a continuous stream of creations, providing a live look into the capabilities of the AI models.

-   **Interactive "Feed" and "Edit" Modes**:
    -   **Feed Mode**: By default, users are in "Feed" mode, where they can passively watch a slideshow of content as it's generated. Each piece of content is displayed with its corresponding prompt and model information.
    -   **Edit Mode**: Users can select any item from the feed and switch to "Edit" mode. This provides an interactive playground for AI generation:
        -   **For Images**: Modify the original text prompt, adjust parameters such as image dimensions and seed, and generate a new, customized image.
        -   **For Text**: Refine or completely change the input prompt, choose from available AI models, and generate a new text-based response.

### Technical Stack

-   **Frontend**: The application is built using [React](https://react.dev/) and [Vite](https://vitejs.dev/), providing a fast and modern development experience.
-   **UI Components**: The user interface is constructed with [Material-UI (MUI)](https://mui.com/), ensuring a consistent and responsive design.
-   **State Management**: The application's logic is managed through a series of custom React hooks (e.g., `useImageEditor`, `useTextEditor`, `useImageSlideshow`) that handle state, user inputs, and communication with the backend AI services.

## Development

To get started with development, follow these steps:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run the Development Server**:
    ```bash
    npm run dev
    ```
    This will start the Vite development server, and you can view the application at `http://localhost:5173`.

3.  **Build for Production**:
    ```bash
    npm run build
    ```
    This command bundles the application for production deployment into the `dist` directory.