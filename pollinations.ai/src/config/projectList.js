// Project entries support an optional submissionDate field (format: "YYYY-MM-DD")
// This field is automatically added for new submissions but may not be present in older entries
// The date is not currently displayed in the UI but is recorded for future use
//
// Projects in non-English languages should include:
// - A country flag emoji in the name (e.g., 🇨🇳 for Chinese)
// - A "language" field with the appropriate language code
// - An English translation of the description in parentheses when possible
// 
// Projects can include a 'hidden' flag (hidden: true) to hide them from the README.md
// This is useful for projects that are broken or no longer maintained
// Hidden projects will still be available in the projectList.js but won't appear in the README

export const projectCategories = [
  {
    title: "Featured 🚀",
    key: "featured",
  },
  {
    title: "Vibe Coding ✨",
    key: "vibeCoding",
  },
  {
    title: "LLM Integrations",
    key: "llmIntegrations",
  },
  {
    title: "Creative Apps",
    key: "creativeApps",
  },
  {
    title: "Tools & Interfaces",
    key: "toolsInterfaces",
  },
  {
    title: "Social Bots",
    key: "socialBots",
  },
  {
    title: "SDK & Libraries",
    key: "sdkLibraries",
  },
  {
    title: "Tutorials",
    key: "tutorials",
  },
];

const allProjects = {
  vibeCoding: [
    {
      name: "VibeCoder",
      description: "A conversational coding environment that lets you create applications by describing them in natural language.",
      author: "@Aashir__Shaikh",
      authorUrl: "https://x.com/Aashir__Shaikh",
      submissionDate: "2025-03-25",
      order: 1,
    },
    {
      name: "Pollinations MCP Server",
      url: "https://github.com/pollinations/model-context-protocol",
      description: "A Model Context Protocol server that enables AI-assisted development through natural language interaction with Pollinations' multimodal services.",
      author: "@thomash",
      repo: "https://github.com/pollinations/model-context-protocol",
      stars: 42,
      submissionDate: "2025-05-01",
      order: 1,
    },
    {
      name: "Pollinations Task Master",
      url: "https://github.com/LousyBook94/pollinations-task-master",
      description: "A task management system that uses AI to help break down and organize development tasks through natural language interaction.",
      author: "@LousyBook94",
      repo: "https://github.com/LousyBook94/pollinations-task-master",
      submissionDate: "2025-05-12",
      stars: 3,
      order: 1,
    },
    {
      name: "Qwen-Agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      description: "A framework for developing agentic LLM applications.",
      repo: "https://github.com/QwenLM/Qwen-Agent",
      stars: 6600,
      order: 1,
    },
    {
      name: "JCode Website Builder",
      url: "https://jcode-ai-website-bulder.netlify.app/",
      description: "A website generator using Pollinations text API.",
      author: "@rtxpower",
      order: 1,
    },
    {
      name: "Define",
      url: "https://define-i05a.onrender.com/api/docs/",
      description: "An AI-powered REST API designed to generate definitions for words or phrases, constrained to a specified target word count. It allows customization of tone, context, and language, delivering precise, context-aware definitions programmatically—ideal for developers and content creators.",
      author: "@hasanraiyan",
      repo: "https://github.com/hasanraiyan",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "WebGeniusAI",
      url: "https://webgeniusai.netlify.app/",
      description: "AI tool that generates HTML websites with visuals from Pollinations.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated Pollinations AI services, visual code editing, and project management tools.",
      author: "@thomash",
      submissionDate: "2025-03-01",
      order: 1,
    },
    {
      name: "Websim",
      url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
      description: "A web simulation tool that integrates Pollinations.ai.",
      author: "@thomash",
      order: 2,
    },
    {
      name: "NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 1,
    },
  ],
  toolsInterfaces: [

    {
      name: "VibeCoder",
      description: "A conversational coding environment that lets you create applications by describing them in natural language.",
      author: "@Aashir__Shaikh",
      authorUrl: "https://x.com/Aashir__Shaikh",
      submissionDate: "2025-03-25",
      order: 1,
    },
    {
      name: "Pollinations MCP Server",
      url: "https://github.com/pollinations/model-context-protocol",
      description: "A Model Context Protocol server that enables AI-assisted development through natural language interaction with Pollinations' multimodal services.",
      author: "@thomash",
      repo: "https://github.com/pollinations/model-context-protocol",
      stars: 42,
      submissionDate: "2025-05-01",
      order: 1,
    },
    {
      name: "Pollinations Task Master",
      url: "https://github.com/LousyBook94/pollinations-task-master",
      description: "A task management system that uses AI to help break down and organize development tasks through natural language interaction.",
      author: "@LousyBook94",
      repo: "https://github.com/LousyBook94/pollinations-task-master",
      submissionDate: "2025-05-12",
      stars: 3,
      order: 1,
    },
    {
      name: "Qwen-Agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      description: "A framework for developing agentic LLM applications.",
      repo: "https://github.com/QwenLM/Qwen-Agent",
      stars: 6600,
      order: 1,
    },
    {
      name: "JCode Website Builder",
      url: "https://jcode-ai-website-bulder.netlify.app/",
      description: "A website generator using Pollinations text API.",
      author: "@rtxpower",
      order: 1,
    },
    {
      name: "Define",
      url: "https://define-i05a.onrender.com/api/docs/",
      description: "An AI-powered REST API designed to generate definitions for words or phrases, constrained to a specified target word count. It allows customization of tone, context, and language, delivering precise, context-aware definitions programmatically—ideal for developers and content creators.",
      author: "@hasanraiyan",
      repo: "https://github.com/hasanraiyan",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "WebGeniusAI",
      url: "https://webgeniusai.netlify.app/",
      description: "AI tool that generates HTML websites with visuals from Pollinations.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated Pollinations AI services, visual code editing, and project management tools.",
      author: "@thomash",
      submissionDate: "2025-03-01",
      order: 1,
    },
    {
      name: "Websim",
      url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
      description: "A web simulation tool that integrates Pollinations.ai.",
      author: "@thomash",
      order: 2,
    },
    {
      name: "NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 2,
    },
  ],
  toolsInterfaces: [
    {
      name: "VibeCoder",
      description: "A conversational coding environment that lets you create applications by describing them in natural language.",
      author: "@Aashir__Shaikh",
      authorUrl: "https://x.com/Aashir__Shaikh",
      submissionDate: "2025-03-25",
      order: 1,
    },
    {
      name: "Pollinations MCP Server",
      url: "https://github.com/pollinations/model-context-protocol",
      description: "A Model Context Protocol server that enables AI-assisted development through natural language interaction with Pollinations' multimodal services.",
      author: "@thomash",
      repo: "https://github.com/pollinations/model-context-protocol",
      stars: 42,
      submissionDate: "2025-05-01",
      order: 1,
    },
    {
      name: "Pollinations Task Master",
      url: "https://github.com/LousyBook94/pollinations-task-master",
      description: "A task management system that uses AI to help break down and organize development tasks through natural language interaction.",
      author: "@LousyBook94",
      repo: "https://github.com/LousyBook94/pollinations-task-master",
      submissionDate: "2025-05-12",
      stars: 3,
      order: 1,
    },
    {
      name: "Qwen-Agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      description: "A framework for developing agentic LLM applications.",
      repo: "https://github.com/QwenLM/Qwen-Agent",
      stars: 6600,
      order: 1,
    },
    {
      name: "JCode Website Builder",
      url: "https://jcode-ai-website-bulder.netlify.app/",
      description: "A website generator using Pollinations text API.",
      author: "@rtxpower",
      order: 1,
    },
    {
      name: "Define",
      url: "https://define-i05a.onrender.com/api/docs/",
      description: "An AI-powered REST API designed to generate definitions for words or phrases, constrained to a specified target word count. It allows customization of tone, context, and language, delivering precise, context-aware definitions programmatically—ideal for developers and content creators.",
      author: "@hasanraiyan",
      repo: "https://github.com/hasanraiyan",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "WebGeniusAI",
      url: "https://webgeniusai.netlify.app/",
      description: "AI tool that generates HTML websites with visuals from Pollinations.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated Pollinations AI services, visual code editing, and project management tools.",
      author: "@thomash",
      submissionDate: "2025-03-01",
      order: 1,
    },
    {
      name: "Websim",
      url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
      description: "A web simulation tool that integrates Pollinations.ai.",
      author: "@thomash",
      order: 2,
    },
    {
      name: "NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 2,
    },
  ],
  toolsInterfaces: [
    {
      name: "🇪🇸 Yo el director",
      url: "https://yoeldirector.dpana.com.ve",
      description: "Web para crear peliculas y contenido para youtube, usando Pollinations (Web platform for creating movies and YouTube content using Pollinations)",
      author: "@henryecamposs",
      submissionDate: "2025-06-04",
      language: "es",
      order: 1,
    },
    {
      name: "🛠️ AI Content Describer",
      url: "https://github.com/cartertemm/AI-content-describer/",
      description: "An extension for NVDA, the free and open-source screen reader for Microsoft Windows. Uses multimodal generative AI to help those with blindness and visual impairments understand pictures, UI controls, complex diagrams/graphics, and more through intelligent descriptions that go far beyond simple alt-text.",
      author: "@cartertemm",
      repo: "https://github.com/cartertemm/AI-content-describer/",
      stars: 54,
      submissionDate: "2025-05-28",
      order: 1,
    },
    {
      name: "Pollin-Coder",
      url: "https://pollin-coder.megavault.in",
      description: "A free AI-powered website builder that lets anyone create a clean site just by describing it. It uses Pollinations AI to generate the content and layout instantly.",
      author: "@r3ap3redit",
      submissionDate: "2025-05-19",
      order: 1,
    },
    {
      name: "Imagemate AI",
      url: "https://play.google.com/store/apps/details?id=com.madameweb.imgmate",
      description: "Imagemate AI is a powerful image generation app designed to turn your imagination into stunning visuals with the help of advanced artificial intelligence. Built using the Pollinations AI API, Imagemate AI allows users to input a text prompt and instantly receive AI-generated images that match the description.",
      author: "@Shanto-Islam",
      authorEmail: "msin.shanto.islam@gmail.com",
      submissionDate: "2025-05-13",
      order: 1,
    },
    {
      name: "tgpt",
      url: "https://github.com/aandrew-me/tgpt",
      description: "AI Chatbots in terminal without needing API keys - a command-line interface for AI that appeals to developers and terminal users.",
      author: "@aandrew-me",
      repo: "https://github.com/aandrew-me/tgpt",
      stars: 2560,
      submissionDate: "2025-05-10",
      order: 1,
    },
    {
      name: "B&W SVG Generator",
      url: "https://fluxsvggenerator.streamlit.app/",
      description: "Uses Flux (through pollinations) and potrace to create B&W Vector files",
      author: "@pointsguy118",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "Imagen",
      url: "https://altkriz.github.io/imagen/",
      description: "A beautiful web interface for generating images using Pollinations.ai API with only the \"flux\" and \"turbo\" models.",
      author: "@altkriz",
      repo: "https://github.com/altkriz/imagen",
      stars: 3,
      submissionDate: "2025-04-13",
      order: 2,
    },
    {
      name: "DominiSigns",
      url: "https://github.com/mahmood-asadi/ai-vision-block",
      description: "A custom WordPress Gutenberg block that allows you to generate images using the Pollinations API. Simply enter a prompt, and the AI will generate an image for you. Once the post is saved, the image is automatically stored in the WordPress Media Library.",
      author: "mahmood-asadi",
      repo: "https://github.com/mahmood-asadi/ai-vision-block",
      stars: 5,
      submissionDate: "2025-03-31",
      order: 2,
    },
    {
      name: "toai.chat",
      url: "https://toai.chat",
      description: "An iOS app that integrates with all LLMs including Pollinations AI models in one unified simple interface.",
      author: "Ayushman Bhatacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter/tree/main/Elixpo%20Chrome%20%20Extension",
      stars: 8,
      submissionDate: "2025-03-14",
      order: 4,
    },
    {
      name: "Pollinations Feed",
      url: "https://elixpoart.vercel.app/src/feed",
      description: "A feed of images generated using Pollinations.ai, with options to like, share, and download.",
      author: "Ayushman Bhattacharya",
      submissionDate: "2025-03-14",
      order: 4,
    },
    {
      name: "Anime AI Generation",
      url: "https://www.animeaigeneration.com/",
      description: "Create professional-quality anime characters with powerful AI technology. No artistic skills required.",
      author: "@shreyas281898",
      submissionDate: "2025-02-11",
      order: 3,
    },

    {
      name: "Anime Character Generator",
      url: "https://elixpoart.vercel.app/src/character",
      description: "Create professional-quality anime characters with powerful AI technology. No artistic skills required.",
      author: "@shreyas281898",
      submissionDate: "2025-02-11",
      order: 3,
    },
    {
      name: "JustBuildThings",
      url: "https://justbuildthings.com",
      description: "A collection of AI tools for image generation, character chat, and writing.",
      author: "rasit",
      order: 1,
    },
    {
      name: "Elixpo-Art",
      url: "https://elixpoart.vercel.app",
      description: "A web interface for easy image generation with theme selection.",
      author: "Ayushman Bhattacharya",
      order: 1,
    },
    {
      name: "Free AI Chatbot & Image Generator",
      url: "https://freeaichat.app",
      description: "A mobile app for unlimited AI chat and image generation.",
      author: "@andreas_11",
      order: 2,
    },

    {
      name: "Server Status Dashboards",
      url: "https://www.ai-ministries.com/serverstatus.html",
      description: "Real-time monitoring dashboards for Pollinations text and image servers.",
      author: "@tolerantone",
      order: 1,
    },

    {
      name: "MVKProject Nexus API",
      url: "https://nexus.adonis-except.xyz/",
      description: "An API platform specializing in artificial intelligence services: AI Chat Interaction with models like ChatGPT, Gemini, DeepSeek, and Meta AI, AI Image Generation powered by Pollinations, and AI Image Analysis for content description and insights.",
      author: "@adonis-except",
      submissionDate: "2025-05-12",
      order: 1,
    },
    {
      name: "Irina",
      url: "https://irina-2--trivonca.on.websim.ai/",
      description: "Lightweight and simple online chat interface powered by pollinations",
      author: "@thatalgp",
      submissionDate: "2025-05-11",
      order: 1,
    },
  ],
  creativeApps: [
    {
      name: "🤖 Minecraft AI (Node.js)",
      url: "https://github.com/aeromechanic000/minecraft-ai",
      description: "A framework focusing on AI driven minecraft agents based on mindcraft framework. Features autonomous AI agents that can navigate, build, and interact in Minecraft worlds using natural language processing and computer vision.",
      author: "@aeromechanic000",
      repo: "https://github.com/aeromechanic000/minecraft-ai",
      stars: 7,
      submissionDate: "2025-06-03",
      order: 1,
    },
    {
      name: "🤖 Minecraft AI (Python)",
      url: "https://github.com/aeromechanic000/minecraft-ai-python",
      description: "An Open Framework for Building Embodied AI in Minecraft. Provides tools and APIs for creating intelligent agents that can understand and interact with the Minecraft environment using machine learning and AI techniques.",
      author: "@aeromechanic000",
      repo: "https://github.com/aeromechanic000/minecraft-ai-python",
      stars: 6,
      submissionDate: "2025-06-03",
      order: 1,
    },
    {
      name: "🇪🇸 Juego de Memorizar con Pollinations",
      url: "https://proyectodescartes.org/IATools/Parejas/",
      description: "Un juego de memoria tipo 'encuentra las parejas' donde los usuarios pueden ingresar un tema, elegir un estilo artístico, generar imágenes con la API de Pollinations, editar y regenerar imágenes si es necesario, y descargar el juego completo. (A memory matching game like 'find the pairs' where users can enter a theme, choose an artistic style, generate images with the Pollinations API, edit and regenerate images if needed, and download the complete game.)",
      author: "@juanrivera126",
      submissionDate: "2025-06-03",
      language: "es-ES",
      order: 1,
    },
    {
      name: "🇪🇸 Generador de presentaciones con imágenes y texto V2",
      url: "https://proyectodescartes.org/IATools/Crea_presentaciones4/",
      description: "Una herramienta configurable que permite crear presentaciones con 3 a 20 diapositivas usando la API de Pollinations. Genera títulos, descripciones e imágenes para cada diapositiva, con posibilidad de regenerar imágenes y descargar en HTML. (A configurable tool that allows you to create presentations with 3 to 20 slides using the Pollinations API. Generates titles, descriptions and images for each slide, with the ability to regenerate images and download in HTML.)",
      author: "@juanrivera126",
      submissionDate: "2025-06-03",
      language: "es-ES",
      order: 1,
    },
    {
      name: "🤖 ImageEditer",
      url: "https://t.me/ImageEditer_bot",
      description: "AI Art Studio - A feature-rich Telegram bot that creates art from text prompts, remixes images, merges multiple artworks, and offers one-tap regeneration with real-time control. Supports multiple AI models (GPT Image, Flux, Turbo) with NSFW detection and smart layout features.",
      author: "@_dr_misterio_",
      submissionDate: "2025-06-02",
      order: 1,
    },
    {
      name: "🎨 PixPal",
      url: "https://pixpal.chat",
      description: "PixPal is a free AI assistant that can analyze, edit, and generate images, build websites from screenshots, create 3D games, and write full blog posts—all in one chat. Upload a photo, describe an idea, or request a UI clone and PixPal instantly delivers creative results.",
      author: "@andreas_11",
      submissionDate: "2025-05-30",
      order: 1,
    },
    {
      name: "DreamHer",
      url: "https://dreamher.vercel.app/",
      description: "Interactive web app that transforms your imagination of a 'dream girl' into a visual representation through just 10 simple questions using Pollinations AI. Features AI-powered visualization, dynamic processing, and an engaging, magical user experience.",
      author: "@_Creation22",
      authorUrl: "https://x.com/_Creation22",
      repo: "https://github.com/creation22/DreamGirl",
      stars: 2,
      submissionDate: "2025-05-27",
      order: 1,
    },
    {
      name: "MASala",
      url: "https://github.com/Naman009/MASala",
      description: "Multi-Agent AI That Cooks Up Recipes Just for You ~ From fridge to feast, MASALA plans it all.",
      author: "@Naman009",
      repo: "https://github.com/Naman009/MASala",
      stars: 1,
      submissionDate: "2025-05-20",
      order: 1,
    },
    {
      name: "Emojiall AI Drawing Platform",
      url: "https://art.emojiall.com",
      description: "A platform focused on allowing users to draw pictures according to their own requirements with many preset styles and themes. Part of Emojiall, which has other text-based AI features like Emoji translation to text, Emoji recommender, and Emoji chatbot.",
      author: "@James-Qi",
      authorEmail: "qijingsong@gmail.com",
      submissionDate: "2025-05-20",
      order: 1,
    },
    {
      name: "FoldaScan",
      url: "https://fs.wen.bar",
      description: "Use Natural Language to \"Converse\" with Your Codebase, Folda-Scan Smart Project Q&A, powered by advanced vectorization technology, allows you to easily understand complex code, pinpoint information, and offers unprecedented convenience for AI collaboration.",
      author: "@0010skn",
      repo: "https://github.com/0010skn/WebFS-Toolkit-Local-Folder-Scan-Monitor-Versioning-AI-Prep",
      submissionDate: "2025-05-19",
      order: 1,
    },
    {
      name: "Favorite Puzzles",
      url: "https://radbrothers.com/games/favorite-puzzles/",
      description: "A jigsaw puzzles game for Android, iOS, and web that uses Pollinations feed as one of the sources of images for puzzles. Features puzzle generation using neural networks, customizable difficulty levels from 6 to 1200 pieces, multiple game modes, and the ability to create puzzles from your own images.",
      author: "contact@radbrothers.com",
      submissionDate: "2025-05-19",
      order: 1,
    },
    {
      name: "AI YouTube Shorts Generator",
      description: "Python desktop app that automates YouTube Shorts creation with AI-generated scripts, voiceovers (via ElevenLabs), and visuals using Pollinations API. Designed for content creators, educators, and marketers to produce high-quality short videos quickly without manual editing.",
      author: "@Sami-Alsahabany",
      authorEmail: "SamiAlsahabany@outlook.com",
      submissionDate: "2025-05-16",
      order: 1,
    },
    {
      name: "AI Chat",
      url: "https://aichat.narendradwivedi.org",
      description: "A Windows desktop application that brings multiple AI models together in one simple, intuitive interface. Features saving/loading conversations, image generation, image explanation from URLs, and voice responses with different voices.",
      author: "@narendradwivedi",
      authorUrl: "https://www.linkedin.com/in/narendradwivedi",
      submissionDate: "2025-05-16",
      order: 1,
    },
    {
      name: "Aiphoto智能绘画 🇨🇳",
      url: "https://qiyimg.3d.tc/Aiphoto",
      description: "AI艺术工坊 - 智能绘画生成器。这是一个基于AI的绘画生成工具，可以根据用户输入的中文描述自动生成相应的图片。(An AI art workshop - intelligent painting generator. This is an AI-based painting generation tool that can automatically generate images based on Chinese descriptions input by users.)",
      author: "@qiyimg",
      submissionDate: "2025-05-11",
      order: 1,
    },
    {
      name: "KoboldAI Lite",
      url: "https://koboldai.net",
      description: "A lightweight AI framework for text generation and chat.",
      author: "@lostruins",
      repo: "https://github.com/LostRuins/lite.koboldai.net",
      stars: 3700,
      submissionDate: "2025-05-09",
      order: 0,
    },
    {
      name: "Polynate",
      url: "https://polynate.cloudwerx.dev/",
      description: "AI-powered text and audio content generation platform providing a user-friendly interface for interacting with various AI generation services from Pollinations.ai.",
      author: "@fisven",
      repo: "https://github.com/fisventurous/pollinationsai-enhancer",
      stars: 0,
      submissionDate: "2025-04-27",
      order: 1,
    },


  ],
  llmIntegrations: [
    {
      name: "🆕 🤖 Mindcraft",
      url: "https://github.com/kolbytn/mindcraft",
      description: "Crafting minds for Minecraft with LLMs and Mineflayer! An AI agent framework for Minecraft using Large Language Models that creates intelligent bots capable of autonomous gameplay, building, and interaction.",
      author: "@kolbytn",
      repo: "https://github.com/kolbytn/mindcraft",
      stars: 3500,
      submissionDate: "2025-06-03",
      order: 1,
    },
    {
      name: "🆕 Whizzy AI",
      url: "https://whizzyai.vercel.app",
      description: "An educational AI platform for students featuring AI-powered study assistance, chat functionality, and image generation capabilities using Pollinations AI. Designed to help students with studies they find challenging.",
      author: "@vaibhavcoding69",
      submissionDate: "2025-06-03",
      order: 1,
    },
    {
      name: "AI Code Generator",
      url: "https://codegen.on.websim.com/",
      description: "A websim project that generates code from description, selected programming language and other options. Integrates Pollinations because it allows for more models to choose from for potentially better results. It has modes like: Code Generator, Code Explainer, Reviewer, etc.",
      author: "@Miencraft2",
      submissionDate: "2025-05-25",
      order: 1,
    },
    {
      name: "🖥️ Windows Walker",
      url: "https://github.com/SuperShivam5000/windows-walker",
      description: "Windows Walker – What Copilot for Windows should have been. AI-powered Windows assistant that translates voice/text commands into real system actions using PowerShell. Powered by ChatGPT + PowerShell in an Electron UI.",
      author: "@supershivam",
      repo: "https://github.com/SuperShivam5000/windows-walker",
      stars: 3,
      submissionDate: "2025-05-22",
      order: 1,
    },
    {
      name: "🎤 Comeback AI",
      url: "https://comeback-ai.pinkpixel.dev",
      description: "AI-powered clapback machine that transforms mean comments into witty comebacks with 10 unique personas, uses Pollinations openai-audio for voice synthesis, and Whisper for speech-to-text transcription. Turn trolls into comedy gold!",
      author: "@sizzlebop",
      repo: "https://github.com/pinkpixel-dev/comeback-ai",
      stars: 1,
      submissionDate: "2025-05-31",
      order: 1,
    },
    {
      name: "The Promised Pen",
      url: "https://promisedpen.app",
      description: "A free, feature-rich novel writing application that helps writers organize stories, characters, and worlds. Uses Pollinations AI for generating chapter summaries, rewriting text based on context, and generating new content based on previous chapters and character information.",
      author: "@soryn.san",
      submissionDate: "2025-05-19",
      order: 1,
    },
    {
      name: "Match-cut video ai",
      url: "https://video-gen.megavault.in",
      description: "This AI generates video from text in match-cut text style, uses pollinations llm to generate nearby text, and supports API integration.",
      author: "@r3ap3redit",
      repo: "https://github.com/iotserver24/match-cut-ai",
      stars: 0,
      submissionDate: "2025-05-18",
      order: 1,
    },
    {
      name: "Anisurge",
      url: "https://anisurge.me",
      description: "A free anime streaming app with a public chat feature that allows users to chat with AI characters powered by Pollinations AI.",
      author: "@iotserver24",
      submissionDate: "2025-05-16",
      order: 1,
    },
    {
      name: "MoneyPrinterTurbo",
      url: "https://github.com/harry0703/MoneyPrinterTurbo",
      description: "Simply provide a topic or keyword for a video, and it will automatically generate the video copy, video materials, video subtitles, and video background music before synthesizing a high-definition short video. Integrates Pollinations' text generation service to create engaging and relevant video scripts.",
      author: "@harry0703",
      repo: "https://github.com/harry0703/MoneyPrinterTurbo",
      stars: 32186,
      submissionDate: "2025-05-13",
      order: 1,
    },
    {
      name: "SillyTavern",
      url: "https://docs.sillytavern.app/",
      description: "An LLM frontend for power users. Pollinations permits it to generate text and images.",
      repo: "https://github.com/SillyTavern/SillyTavern",
      stars: 14700,
      order: 1,
    },
    {
      name: "LLM7.io",
      url: "https://llm7.io",
      description: "A free and open AI platform providing advanced multimodal capabilities, including large language model access and experimental search tools. Integrates Pollinations text generation as a backend service with transparent credit on the website and repository.",
      author: "@chigwell",
      repo: "https://github.com/chigwell/llm7.io",
      stars: 7,
      submissionDate: "2025-05-30",
      order: 1,
    },
    {
      name: "Pollinations.AI Enhancer",
      url: "https://github.com/fisventurous/pollinationsai-enhancer",
      description: "A frontend-based AI interface designed to deliver a smooth, multimodal, and visually engaging user experience with conversational AI, image generation, and more.",
      author: "@fisven",
      repo: "https://github.com/fisventurous/pollinationsai-enhancer",
      stars: 0,
      submissionDate: "2025-04-27",
      order: 1,
    },
    {
      name: "AIMinistries",
      url: "https://www.ai-ministries.com",
      description: "A collection of free AI tools including AI chat, writing tools, image generation, image analysis, text-to-speech, and speech-to-text.",
      author: "@tolerantone",
      submissionDate: "2025-04-21",
      order: 1,
    },
    {
      name: "Rizqi O Chatbot 🇮🇩",
      url: "https://chatbot.rizqioliveira.my.id",
      description: "Rizqi O Chatbot adalah proyek berbasis Pollinations yang menggabungkan tiga fitur utama: chatbot AI, generator gambar AI, dan generator audio AI. Pengguna dapat berinteraksi dalam bentuk teks, menghasilkan gambar dengan berbagai gaya seni dan efek visual, serta membuat audio secara otomatis dari teks. (An AI chatbot, image generator, and audio generator project with support for custom aspect ratios, over 200 art styles & visual effects, and automatic translation from Indonesian to English.)",
      author: "@ray23-bit",
      repo: "https://github.com/ray23-bit/Projectenam",
      stars: 1,
      submissionDate: "2025-05-08",
      language: "id-ID",
      order: 3,
    },
    {
      name: "Foodie AI",
      url: "https://foodie-ai.vercel.app/",
      description: "An AI application for food analysis that uses advanced artificial intelligence technology to help users understand food ingredients, nutritional value, and health impacts. Provides food safety analysis, nutritional health assessment, sports and fitness analysis, visual display, alternative recommendations, and practical insights for different dietary habits.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "LobeChat",
      url: "https://github.com/lobehub/lobe-chat",
      description: "An open-source, modern-design ChatGPT/LLMs UI/Framework with speech-synthesis, multi-modal, and extensible plugin system.",
      author: "@arvinxx",
      repo: "https://github.com/lobehub/lobe-chat",
      stars: 12000,
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations.AI 中文",
      url: "https://pollinations.vercel.app",
      description: "我们提供高质量的AI生成服务，包括图像生成、文本生成、音频生成和语音转文本服务， 让您轻松创建各种创意内容。 (We provide high-quality AI generation services, including image generation, text generation, audio generation, and speech to text services, allowing you to easily create various creative content.)",
      author: "@pollinations",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Quicker Pollinations AI",
      url: "https://getquicker.net/Sharedaction?code=9ac738ed-a4b2-4ded-933c-08dd5f710a8b&fromMyShare=true",
      description: "This project provides a free API interface supporting various text and image generation models, including OpenAI's GPT-4, Gemini 2.0, etc. Users can access these models without an API key to perform text generation, image generation, translation, text polishing, and more.",
      author: "https://linux.do/u/s_s/summary",
      submissionDate: "2025-03-10",
      language: "zh-CN",
      order: 4,
    },
    {
      name: "Zelos AI image generator",
      url: "https://websim.ai/@ISWEARIAMNOTADDICTEDTOPILLOW/ai-image-prompt-generator",
      description: "It uses Pollinations for both prompt enhancing and image generation, it was a easy to make project due to pollinations services being easy to use.",
      author: "https://www.roblox.com/users/4361935306/profile",
      submissionDate: "2025-02-17",
      order: 2,
    },
    {
      name: "Mirexa AI Chat",
      url: "https://mirexa.vercel.app",
      description: "A state-of-the-art AI chatbot that seamlessly integrates multiple LLMs with advanced multimodal capabilities. Features comprehensive text generation, sophisticated image creation and image-to-image transformation, audio generation, mathematical problem solving, and real-time web search functionality.",
      author: "[WithThatWay on GitHub](https://github.com/withthatway)",
      submissionDate: "2025-02-07",
      order: 2,
    },
    {
      name: "Pollinations Chat",
      url: "https://websim.ai/@AdrianoDev1/pollinations-ai-assistant/4",
      description: "Pollinations' integrated AI for text and images, totally free and unlimited.",
      author: "@adrianoprogramer",
      order: 3,
    },
    {
      name: "LobeChat",
      url: "https://lobehub.com/plugins/pollinations-drawing",
      description: "An open-source, modern-design ChatGPT/LLMs UI/Framework with speech-synthesis, multi-modal, and extensible plugin system.",
      repo: "https://github.com/lobehub/lobe-chat",
      stars: 59000,
      order: 2,
    },

    {
      name: "Pollinations Chatbot",
      url: "https://pollinations-chatbot.vercel.app/",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "OkeyMeta",
      url: "https://okeymeta.com",
      description: "An LLM created by Africans to understand and have cultural awareness of African contexts and languages, OkeyAI outperforms many LLM models based on size and intelligence, OkeyMeta uses pollination image generating API to train it's LLM (OkeyAI) on images in real time.",
      author: "@okeymeta",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Snarky Bot",
      url: "https://snarkybot.vercel.app/",
      description: "A snarky bot based on Llama that is 100% free, powered by the Pollinations text API and OpenWebUI. Other models are available as well.",
      author: "@snarkybot",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Playground",
      url: "https://pollinations-ai-playground.vercel.app/",
      description: "An AI application platform based on Pollinations.AI API, providing free and unlimited AI chat assistant, image generation, and voice synthesis services.",
      author: "@playground",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Free API",
      url: "https://pollinations-ai-free-api.vercel.app/",
      description: "This project provides a free API interface supporting various text and image generation models, including OpenAI's GPT-4, Gemini 2.0, etc. Users can access these models without an API key to perform text generation, image generation, translation, text polishing, and more.",
      author: "@freeapi",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Chatbot",
      url: "https://pollinations-ai-chatbot.vercel.app/",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@chatbot",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Image Generator",
      url: "https://pollinations-ai-image-generator.vercel.app/",
      description: "An AI-powered image generation platform for Android designed to create stunning visuals from text prompts. Features dynamic image generation as users scroll, save to gallery, favorites, and a user-friendly interface.",
      author: "@imagegen",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Herramientas IA",
      url: "https://herramientas.ia",
      description: "Tools designed with Pollinations.AI and the DescartesJS editor, including tools from other Pollinations.AI community members.",
      author: "@herramientas",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Video Generator",
      url: "https://pollinations-ai-video-generator.vercel.app/",
      description: "An open-source video generation system using AI.",
      author: "@videogen",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Pollinations AI Game",
      url: "https://pollinations-ai-game.vercel.app/",
      description: "A Hitchhiker's Guide to the Galaxy themed LLM-based elevator game.",
      author: "@game",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "POLLIPAPER",
      url: "https://github.com/Tolerable/POLLIPAPER",
      description: "A dynamic wallpaper app that uses Pollinations AI.",
      author: "@intolerant0ne",
      order: 2,
    },
    {
      name: "AI PPT Maker",
      url: "https://sites.google.com/view/kushai",
      description: "Create AI-powered presentations using Pollinations' API.",
      author: "@k_ush",
      order: 2,
    },
    {
      name: "UR Imagine & Chat AI",
      url: "https://perchance.org/ur-imagine-ai",
      description: "A free and limitless image generator with companion AI chat/roleplay system.",
      author: "withthatway",
      order: 2,
    },
    {
      name: "Pollinations Gallery",
      url: "https://deng-xian-sheng.github.io/pollinations-img-page/",
      description: "A clean and simple gallery showcasing community's AI-generated images.",
      author: "@deng-xian-sheng",
      order: 3,
    },
    {
      name: "AI-Bloom",
      url: "https://ai-bloom.vercel.app/",
      description: "A minimal creative showcase of AI-powered content generation.",
      author: "@diepdo1810",
      order: 2,
    },
  ],
  socialBots: [
    {
      name: "🤖 GPT_Project",
      url: "https://t.me/gpt_project_official_bot",
      description: "GPT_Project Telegram AI Chatbot was conceived as a professional productivity tool that's always in your pocket. Uses Pollinations API for image generation with models like Flux and language models such as GPT-4.1, GPT-4.1-nano, and SearchGPT. Features include advanced AI interaction, versatile image generation, AI-powered image analysis, voice message recognition, and text-to-speech.",
      author: "@lordon4x",
      submissionDate: "2025-06-03",
      order: 1,
    },
    {
      name: "🤖 AdvanceChatGptBot",
      url: "https://t.me/AdvChatGptBot",
      description: "A powerful AI-driven Telegram bot that brings cutting-edge artificial intelligence features to your fingertips. Features GPT-4o and GPT-4o-mini, DALL-E Model, OCR and Google Voice2Text. Uses Pollinations through @gpt4free Python lib.",
      author: "@techycsr",
      repo: "https://github.com/TechyCSR/AdvAITelegramBot",
      stars: 4,
      submissionDate: "2025-05-24",
      order: 1,
    },
    {
      name: "🤖 PolliBot",
      url: "https://github.com/mrMeowMurk/PolliBot",
      description: "A powerful Telegram bot for interacting with Pollinations.ai API, providing a convenient interface for generating images and text using various AI models.",
      author: "@mrMeowMurk",
      repo: "https://github.com/mrMeowMurk/PolliBot",
      stars: 1,
      submissionDate: "2025-05-19",
      order: 1,
    },
    {
      name: "Aura Chat Bot",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@Py-Phoenix-PJS",
      email: "itznarutotamilan007@gmail.com",
      submissionDate: "2025-05-12",
      order: 1,
    },
    {
      name: "Quick AI & Jolbak",
      description: "Discord bots providing AI services to users in Iran who have limited access to AI tools like Claude, ChatGPT, and Gemini.",
      author: "@d__mx",
      submissionDate: "2025-05-12",
      order: 3,
    },
    {
      name: "AI Image Generator [ROBLOX]",
      description: "An image generator on Roblox that integrates with Pollinations APIs for text and image generation, processing images pixel by pixel.",
      author: "@mr.l4nd3n",
      submissionDate: "2025-05-12",
      order: 2,
    },
    {
      name: "🤖 SingodiyaTech bot",
      url: "https://t.me/Aks7240Bot",
      description: "This is a Telegram bot with many Advanced ai features.",
      author: "t.me/Aks979",
      submissionDate: "2025-05-10",
      order: 4,
    },
    {
      name: "🤖 Raftar.xyz",
      url: "https://raftar.xyz",
      description: "A Discord multi-purpose bot with over 100+ commands, including AI image generation, ChatGPT, and SearchGPT powered by Pollinations.AI.",
      author: "@goodgamerhere",
      submissionDate: "2025-04-15",
      order: 4,
    },
    {
      name: "AlphaLLM - AI Discord Bot",
      url: "https://alphallm.fr.nf",
      description: "Discord bot that uses several APIs (Pollinations AI and Cerebras AI), to offer a variety of features, including advanced text generation with a history of your conversations, image and voice generation.",
      author: "@the_yerminator",
      repo: "https://github.com/YoannDev90/AlphaLLM",
      stars: 5,
      submissionDate: "2025-03-31",
      order: 5,
    },
    {
      name: "🤖 pollinations-tg-bot 🇨🇳",
      url: "https://t.me/AipolBot",
      description: "A Telegram bot deployed on Cloudflare Workers that allows users to generate images, convert text to speech, transcribe voice messages, chat with AI models, and more through the Pollinations API.",
      author: "@Shadownc",
      repo: "https://github.com/Shadownc/pollinations-tg-bot",
      stars: 2,
      submissionDate: "2025-03-27",
      language: "zh-CN",
      order: 5,
    },
    {
      name: "Jackey",
      url: "https://discord.com/oauth2/authorize?client_id=1214916249222643752",
      description: "A Discord Bot that integrates with the pollination image generation api to generate images in various themes, numbers, ratios and models",
      author: "@elixpo.asm",
      submissionDate: "2025-03-15",
      order: 1,
    },
    {
      name: "🎮 Gacha",
      url: "https://discord.com/oauth2/authorize?client_id=1377330983740903586",
      description: "Your Sassy All-in-One AI Discord Bot. A powerful, sassy, and slightly mischievous AI bot designed to level up your Discord server with intelligent conversations, creative tools, and smart automation — all wrapped in a playful personality. Features AI-powered chat with STM and LTM, image generation & editing, image fusion & GIF handling, real-time web search, voice replies, media intelligence, slash commands, and dynamic intent detection.",
      author: "`_dr_misterio_`",
      submissionDate: "2025-02-24",
      order: 1,
    },
    {
      name: "One Word",
      url: "https://t.me/OdnoSlovoBot",
      description: "A Telegram bot for a word-matching game where players try to write the same word simultaneously, featuring image generation from game words using Pollinations.AI.",
      author: "@Dimaq21",
      submissionDate: "2025-02-17",
      order: 4,
    },
    {
      name: "Titan-GPT",
      url: "https://t.me/titangpt_channel",
      description: "Free Telegram bot providing access to neural networks including image and text generation powered by Pollinations.AI",
      author: "t.me/titangpt_support",
      order: 2,
    },
    {
      name: "Discord Bot",
      url: "https://discord.gg/D9xGg8mq3D",
      description: "A Discord bot for generating images based on user prompts.",
      author: "@Zngzy",
      order: 1,
    },
    {
      name: "Telegram Bot",
      url: "http://t.me/pollinationsbot",
      description: "A Telegram bot for generating images based on user prompts.",
      author: "Wong Wei Hao",
      order: 2,
    },
    {
      name: "WhatsApp Group",
      url: "https://chat.whatsapp.com/KI37JqT5aYdL9WBYMyyjDV",
      description: "A WhatsApp group for image generation.",
      author: "@dg_karma",
      order: 1,
    },
    {
      name: "OpenHive",
      url: "https://discord.gg/Zv3SXTF5xy",
      description: "A Discord server bridging Discord and AI, featuring Beebot.",
      author: "@creativegpt",
      order: 1,
    },
    {
      name: "Anyai",
      url: "https://discord.gg/anyai",
      description: "A Discord bot and community for AI-driven content.",
      author: "@meow_18838",
      hidden: true,
      order: 5,
    },
  ],
  sdkLibraries: [
    {
      name: "Mimir AIP",
      url: "https://mimir-aip.github.io/",
      description: "An open-source AI pipeline framework designed to simplify the integration and orchestration of various AI models and services. The platform provides a modular architecture that allows developers to easily build, test, and deploy AI-powered applications with support for Pollinations.ai as a provider.",
      author: "@pipeline",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "ai/teens worldwide",
      url: "https://aiteens.worldwide.pollinations.ai",
      description: "Session 2: ai/teens worldwide conference exploring the forces shaping AI today, diving into governance, virtual connections, and decision-making with voices from multiple European cities.",
      author: "@aiteens",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "Apple Shortcuts Guide",
      url: "https://www.youtube.com/watch?v=5NR5h7DTtEI",
      description: "Video guide on creating AI images using Apple Shortcuts.",
      author: "@tolerantone",
      order: 1,
    },
  ],
};

export const projects = {
  featured: [],
  vibeCoding: [],
  llmIntegrations: [],
  creativeApps: [],  // Add this
  toolsInterfaces: [], // Add this
  socialBots: [],
  sdkLibraries: [],
  tutorials: [],
};

// Check if a project is new (submitted within the last 15 days)
const isNewProject = (project) => {
  if (!project.submissionDate) {
    return false;
  }

  try {
    const submissionDate = new Date(project.submissionDate);
    const now = new Date();
    const diffTime = Math.abs(now - submissionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 15;
  } catch (error) {
    // If there's any error parsing the date, default to removing the emoji
    return true;
  }
};

/**
 * Sort projects by order parameter (ascending) and then by stars (descending)
 * 
 * @param {Array} projects - Array of project objects to sort
 * @returns {Array} - Sorted array of projects
 */
const sortProjectsByOrderAndStars = (projects) => {
  return [...projects].sort((a, b) => {
    // First compare by order (lower order comes first)
    const orderA = typeof a.order === 'number' ? a.order : 3; // Default to middle order (3) if not specified
    const orderB = typeof b.order === 'number' ? b.order : 3;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Then compare by stars (higher stars come first)
    const starsA = a.stars || 0;
    const starsB = b.stars || 0;
    
    return starsB - starsA;
  });
};

/**
 * Organizes projects into categories and creates the featured section
 *
 * @param {Object} sourceProjects - Object containing all projects by category
 * @returns {Object} - Organized projects object with populated categories
 */
const organizeFeaturedProjects = (sourceProjects) => {
  const result = {
    featured: [],
    vibeCoding: [],
    llmIntegrations: [],
    creativeApps: [],
    toolsInterfaces: [],
    socialBots: [],
    sdkLibraries: [],
    tutorials: [],
  };

  // Process each category
  Object.keys(sourceProjects).forEach(category => {
    // First, collect all projects in this category
    const categoryProjects = [];
    
    // Find projects with order <= 1, prioritizing by stars and then recency
    const order1Projects = sourceProjects[category]
      .filter(project => project.order <= 1 && !project.hidden)
      .sort((a, b) => {
        // First sort by stars (higher stars first)
        const starsA = a.stars || 0;
        const starsB = b.stars || 0;
        
        if (starsA !== starsB) {
          return starsB - starsA;
        }
        
        // Then by submission date (most recent first)
        const dateA = a.submissionDate ? new Date(a.submissionDate) : new Date(0);
        const dateB = b.submissionDate ? new Date(b.submissionDate) : new Date(0);
        return dateB - dateA;
      })
      .slice(0, 5); // Take top 3
    
    // Create a set of project names that should be featured
    const featuredProjectNames = new Set(order1Projects.map(project => 
      project.name.replace("🆕", "").trim()
    ));

    sourceProjects[category].forEach(project => {
      // Skip hidden projects
      if (project.hidden) {
        return;
      }
      
      // Check if project is new and add isNew flag
      const processedProject = {
        ...project,
        isNew: isNewProject(project)
      };
      
      // Get name for checking
      const normalizedName = project.name;

      // Update featured flag based only on being in the top 5 order=1 projects
      if (featuredProjectNames.has(normalizedName)) {
        // Add to featured section
        result.featured.push({
          ...processedProject,
          originalCategory: category,
          featured: true
        });
        
        // Also mark as featured in the main category
        processedProject.featured = true;
      } else {
        // Remove featured flag if it existed
        delete processedProject.featured;
      }

      // Add to category collection
      categoryProjects.push(processedProject);
    });

    // Sort projects by order and star count
    const sortedProjects = sortProjectsByOrderAndStars(categoryProjects);

    // Add sorted projects to result
    result[category] = sortedProjects;
  });

  // Sort featured projects by order and stars
  result.featured = sortProjectsByOrderAndStars(result.featured);
  return result;
};

// Generate the organized projects
const organizedProjects = organizeFeaturedProjects(allProjects);
console.log("organizedProjects", organizedProjects);
// Export the final projects object
Object.keys(projects).forEach(category => {
  projects[category] = organizedProjects[category];
});