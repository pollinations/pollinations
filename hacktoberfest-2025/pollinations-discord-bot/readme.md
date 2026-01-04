# Discord AI Bot — Lily Integration with Pollinations

This project connects **Discord.js** with the **Pollinations AI API** to generate both text and images dynamically.
It was built as part of **Hacktoberfest 2025**, contributing to the [Pollinations](https://github.com/pollinations/pollinations) repository.

## 🚀 Features

1. Interactive chat support in Discord (via mentions or replies).
2. Text generation using Pollinations Text AI models.
3. Image generation via Pollinations Image API (`flux`, `kontext`, `turbo`, `gptimage`).
4. Automatic conversation memory storage in `memory.log`.
5. Centralized logging in `bot.log`.
6. HTTP endpoint `/discord-bot/discord` for testing and monitoring.
7. Automatic retry system for rate limits or network errors.

## ⚙️ Installation

1. Make sure you have **Node.js v18+** installed.
2. Clone your forked repository:

   ```bash
   git clone https://github.com/<username>/pollinations.git
   cd pollinations/hacktoberfest-2025/<your-folder-name>
   ```
3. Install dependencies:

   ```bash
   npm install express body-parser dotenv tweetnacl discord.js axios
   ```
4. Create a `.env` file with the following contents:

   ```env
   DISCORD_TOKEN=your_discord_token
   DISCORD_PUBLIC_KEY=your_discord_public_key
   APPLICATION_ID=your_discord_app_id
   POLLINATIONS_API_KEY=your_pollinations_api_key
   PORT=8080
   ```
5. Run the bot:

   ```bash
   node index.js
   ```

## 💬 Usage

1. Invite the bot to your Discord server using the **OAuth2 URL** from the Developer Portal.
2. Once it’s online, try these commands:

   * `@Lily hi, how are you?`
   * `/ask question: create a cute cat image with flux`
3. You can also test the HTTP endpoint:

   ```
   http://localhost:8080/discord-bot/discord?message=create a dragon image
   ```

## 🧠 Folder Structure

```
hacktoberfest-2025/
 └── <your-folder-name>/
      ├── index.js
      ├── .env.example
      ├── bot.log
      ├── memory.log
      └── README.md
```

## 🤝 Contribution

This project is a contribution to **Hacktoberfest 2025**.
To contribute:

1. Fork the main [Pollinations repository](https://github.com/pollinations/pollinations).
2. Add your project folder inside `hacktoberfest-2025/`.
3. Create a **Pull Request** to the main branch.

## 📄 License

This project is released under the **MIT License**.
You’re free to use, modify, and distribute it as long as proper credit is given.
