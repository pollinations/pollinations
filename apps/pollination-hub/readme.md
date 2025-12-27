
# Pollination Hub 🐝

![Version](https://img.shields.io/badge/version-2.0-blue)
![Status](https://img.shields.io/badge/status-active-success)

**Pollination Hub** is a lightweight, single-file web interface for accessing the [Pollinations.ai](https://pollinations.ai/) ecosystem. It provides a unified, responsive, and feature-rich workspace for both **AI Text Chat** (LLMs) and **Image Generation**.

Built with modern web technologies, it requires no backend installation and runs entirely in your browser.

---

## ✨ Features

### 🧠 Dual-Mode Engine
*   **Chat Mode:** Interface with various LLMs (OpenAI, Gemini, Claude, Mistral, etc.) via Pollinations' OpenAI-compatible endpoint.
*   **Image Mode:** Generate high-quality images using models like Flux, Turbo, and others with aspect ratio controls.

### 🎨 UI/UX & Design
*   **Responsive Design:** Fully optimized for Mobile, Tablet, and Desktop.
*   **Modern Dark Mode:** Sleek, glassmorphism-inspired UI using Tailwind CSS.
*   **Rich Rendering:**
    *   **Markdown Support:** Tables, lists, bold, italics.
    *   **Code Highlighting:** Auto-detects language and highlights syntax (Highlight.js).
    *   **Math Support:** Renders LaTeX equations via KaTeX (e.g., $E=mc^2$).
    *   **Thinking Blocks:** Collapsible sections for models that output chain-of-thought reasoning (`<think>`).

### 🛠 Power User Tools
*   **History Management:**
    *   Conversations are saved locally (LocalStorage).
    *   Strict separation between Chat logs and Image logs.
    *   **Edit & Resend:** Edit previous user messages to branch conversations.
*   **Settings & Configuration:**
    *   **Custom API Keys:** Input your own Pollinations API keys (supports multi-key rotation for load balancing).
    *   **System Prompt:** Customize the AI's persona (e.g., "You are a coding expert").
*   **Debug Inspector:** Click the `(i)` icon on any AI response to view:
    *   Token usage and latency.
    *   Provider details.
    *   Raw JSON Request/Response bodies.
*   **Image Tools:**
    *   Aspect Ratio selection (1:1, 16:9, 9:16).
    *   Magic Enhance toggle.
    *   One-click Blob Download (bypasses URL navigation).

---

## 🚀 Getting Started

Since Pollination Hub is a client-side application, there are no dependencies to install.

### Method 1: Direct Open
1.  Download the `index.html` file.
2.  Double-click it to open it in your default web browser (Chrome, Edge, Firefox, Safari).

### Method 2: Local Server (Recommended)
For the best experience (and to avoid CORS issues with some browser security settings), run it on a simple local server.

If you have Python installed:
```bash
# Run in the directory containing index.html
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000`.

---

## ⚙️ Configuration

### API Keys
While Pollinations.ai provides free tiers, using your own API key allows for higher rate limits and reliability.
1.  Get a key from [enter.pollinations.ai](https://enter.pollinations.ai/).
2.  In Pollination Hub, click **Settings** (bottom left).
3.  Enter keys one per line. The app will randomly rotate through them for every request.

### System Prompt
You can define how the AI behaves globally in the **Settings** menu.
*   *Default:* "You are a helpful AI assistant. Answer efficiently and accurately."

---

## 🛠 Tech Stack

*   **HTML5 & Vanilla JavaScript:** Core logic (No frameworks like React/Vue required).
*   **Tailwind CSS:** Styling and responsiveness (loaded via CDN).
*   **Marked.js:** Markdown parsing.
*   **Highlight.js:** Code syntax highlighting.
*   **KaTeX:** Mathematical formula rendering.
*   **FontAwesome:** Icons.

---

## 📸 Screenshots

*   **Chat Interface:** Clean conversation view with code blocks and thinking tags.
*   **Image Generator:** Prompt input with aspect ratio controls and immediate preview.
*   **Debug Modal:** Detailed API inspection for developers.

---

## ⚠️ Privacy Note

*   **Local Storage:** All chat history and API keys are stored in your browser's `localStorage`. Nothing is sent to a third-party server other than the actual generation requests sent directly to `pollinations.ai`.
*   **API Security:** Your API keys are stored in plain text in your browser's local storage. Do not use this on public/shared computers without clearing your data afterwards.
