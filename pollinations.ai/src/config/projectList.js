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
  toolsInterfaces: [
    {
      name: "🆕 Polynate",
      url: "https://polynate.cloudwerx.dev/",
      description: "AI-powered text and audio content generation platform providing a user-friendly interface for interacting with various AI generation services from Pollinations.ai.",
      author: "@voodoohop",
      repo: "https://github.com/CLOUDWERX-DEV/polynate",
      stars: 1,
      submissionDate: "2025-05-04",
      order: 1,
    },
    {
      name: "🆕 Echo AI",
      url: "https://3ch0ai.github.io/EchoAI",
      description: "An HTML-based chat interface that leverages Pollinations AI as its core engine for both text and image generation, featuring user authentication, streaming responses, and plan management.",
      author: "@3ch0AI",
      repo: "https://github.com/3ch0AI/EchoAI",
      submissionDate: "2025-04-28",
      order: 2,
    },
    {
      name: "🆕 Pollinations.ai Enhancer",
      url: "https://greasyfork.org/en/scripts/534183-pollinations-ai-enhancer",
      description: "Enhances the user experience on pollinations.ai pages by improving content readability, adding convenient download options, and providing easy access to generation metadata.",
      author: "@fisven",
      repo: "https://github.com/fisventurous/pollinationsai-enhancer",
      stars: 0,
      submissionDate: "2025-04-27",
      order: 1,
    },
    {
      name: "🆕 NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 2,
    },
    {
      name: "🆕 VibeCoder",
      url: "https://vibecoderbyaashir.netlify.app/",
      description: "A web app for coding with vibes, created using Pollinations.AI Open Source API without coding syntax.",
      author: "@Aashir__Shaikh",
      authorUrl: "https://x.com/Aashir__Shaikh",
      submissionDate: "2025-03-25",
      order: 1,
    },
  ],
  llmIntegrations: [
    {
      name: "🆕 CoNavic",
      url: "https://github.com/mkantwala/CoNavic/",
      description: "A free, open-source browser extension that brings the power of ChatGPT and browser automation directly to your fingertips. Instantly access AI assistance, manage tabs, and organize bookmarks using natural language all securely within your browser.",
      author: "@mkantwala",
      repo: "https://github.com/mkantwala/CoNavic/",
      stars: 1,
      submissionDate: "2025-05-01",
      order: 1,
    },
    {
      name: "🆕 imggen.top 🇨🇳",
      url: "https://www.imggen.top/",
      description: "Create stunning AI-generated images in seconds with our free AI image generator. No login required, unlimited generations, powered by FLUX model.",
      author: "lipengliang2012@163.com",
      submissionDate: "2025-04-30",
      language: "zh-CN",
      order: 4,
    },
    {
      name: "🆕 Aura Chat bot",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@Py-Phoenix-PJS",
      submissionDate: "2025-04-26",
      order: 1,
    },
    {
      name: "🆕 FoodAnaly",
      url: "https://foodanaly.vercel.app/",
      description: "An AI application for food analysis that uses advanced artificial intelligence technology to help users understand food ingredients, nutritional value, and health impacts. Provides food safety analysis, nutritional health assessment, sports and fitness analysis, visual display, alternative recommendations, and practical insights for different dietary habits.",
      author: "liukang0120@163.com",
      submissionDate: "2025-04-23",
      order: 1,
    },
    {
      name: "🆕 OkeyAI",
      url: "https://chat.okeymeta.com.ng",
      description: "An LLM created by Africans to understand and have cultural awareness of African contexts and languages, OkeyAI outperforms many LLM models based on size and intelligence, OkeyMeta uses pollination image generating API to train it's LLM (OkeyAI) on images in real time.",
      author: "@okeymeta",
      repo: "https://github.com/okeymeta",
      submissionDate: "2025-04-19",
      order: 1,
    },
    {
      name: "🆕 🤖 DesmondBot",
      url: "https://swedish-innocent-teeth-majority.trycloudflare.com",
      description: "A snarky bot based on Llama that is 100% free, powered by the Pollinations text API and OpenWebUI. Other models are available as well.",
      author: "@mcgdj",
      submissionDate: "2025-04-18",
      order: 2,
    },
    {
      name: "🆕 DreamBig - Generative AI Playground",
      url: "https://dreambiglabs.vercel.app/",
      description: "Interactive AI playground with chat, image generation, and voice responses for creative exploration.",
      author: "@opzzxsprinta._999",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "🆕 Goalani",
      url: "https://goalani.com",
      description: "Voice-enabled AI fitness coach. Using only your voice, you can communicate with the agent to manage your fitness and nutrition. Features weight tracking, exercise logging, food tracking with AI-generated images, and agent customization.",
      author: "goalani.app@gmail.com",
      submissionDate: "2025-04-09",
      order: 3,
    },
    {
      name: "🆕 IMyself AI 🇨🇳",
      url: "https://openai.lmyself.top/",
      description: "我们提供高质量的AI生成服务，包括图像生成、文本生成、音频生成和语音转文本服务， 让您轻松创建各种创意内容。 (We provide high-quality AI generation services, including image generation, text generation, audio generation, and speech to text services, allowing you to easily create various creative content.)",
      author: "Shadownc",
      submissionDate: "2025-03-27",
      language: "zh-CN",
      order: 5,
    },
    {
      name: "🆕 FreeAI 🇨🇳",
      url: "https://freeai.aihub.ren/",
      description: "An AI application platform based on Pollinations.AI API, providing free and unlimited AI chat assistant, image generation, and voice synthesis services.",
      author: "@Azad-sl",
      repo: "https://github.com/Azad-sl/FreeAI",
      submissionDate: "2025-03-24",
      language: "zh-CN",
      stars: 44,
      order: 2,
    },
    {
      name: "🆕 AI Unlimited Customizable Feature Module 🇨🇳",
      url: "https://getquicker.net/Sharedaction?code=9ac738ed-a4b2-4ded-933c-08dd5f710a8b&fromMyShare=true",
      description: "This project provides a free API interface supporting various text and image generation models, including OpenAI's GPT-4, Gemini 2.0, etc. Users can access these models without an API key to perform text generation, image generation, translation, text polishing, and more.",
      author: "https://linux.do/u/s_s/summary",
      submissionDate: "2025-03-10",
      language: "zh-CN",
      order: 4,
    },
    {
      name: "🆕 Zelos AI image generator",
      url: "https://websim.ai/@ISWEARIAMNOTADDICTEDTOPILLOW/ai-image-prompt-generator",
      description: "It uses Pollinations for both prompt enhancing and image generation, it was a easy to make project due to pollinations services being easy to use.",
      author: "https://www.roblox.com/users/4361935306/profile",
      submissionDate: "2025-02-17",
      order: 2,
    },
    {
      name: "🆕 MiReXa AI",
      url: "https://mirexa.vercel.app",
      description: "A state-of-the-art chatbot integrating multiple LLMs with advanced features including audio generation, image generation, mathematical proficiency, and real-time web search.",
      author: "@withthatway",
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
      name: "SillyTavern",
      url: "https://docs.sillytavern.app/extensions/stable-diffusion/",
      description: "An LLM frontend for power users. Pollinations permits it to generate images.",
      repo: "https://github.com/SillyTavern/SillyTavern",
      stars: 13700,
      order: 1,
    },
    {
      name: "FlowGPT",
      url: "https://flowgpt.com/p/instant-image-generation-with-chatgpt-and-pollinationsai",
      description: "Generate images on-demand with ChatGPT!",
      order: 1,
    },
    {
      name: "gpt4free",
      url: "https://github.com/xtekky/gpt4free",
      description: "The official gpt4free repository - various collection of powerful language models.",
      author: "xtekky",
      repo: "https://github.com/xtekky/gpt4free",
      stars: 64100,
      order: 1,
    },
    {
      name: "Unity AI Lab",
      url: "https://blog.unityailab.com/unity.html",
      description: "A specialized uncensored LLM model built on Mistral Large, focused on unrestricted conversations.",
      order: 1,
    },
    {
      name: "DynaSpark AI",
      url: "https://dynaspark.onrender.com",
      description: "A versatile AI assistant with advanced image and text generation capabilities.",
      author: "Th3-C0der",
      repo: "https://github.com/Th3-C0der",
      stars: 20,
      order: 1,
    },
  ],
  creativeApps: [
    {
      name: "🆕 Dreamscape AI",
      url: "https://dreamscape.pinkpixel.dev",
      description: "Dreamscape AI is a creative studio for generating, enhancing, and transforming images, plus conversational AI capabilities with text and voice interfaces, and a deep research tool. The entire site is almost all powered by Pollinations API aside from the image enhancement tools. It generates images, optimizes prompts and creates image titles with the text API, features lots of image styling prompts, also has chat and voice chat with chat memory, and a research tool.",
      author: "@sizzlebop",
      repo: "https://github.com/pinkpixel-dev/dreamscape-ai",
      stars: 2,
      submissionDate: "2025-05-02",
      order: 1,
    },
    {
      name: "🆕 PollinateAI",
      url: "https://pollinateai.vercel.app",
      description: "PollinateAI is an image generation platform that aims to ease the stress of graphic and visual designers in delivering inspirations for their work. Regular consumers are also welcomed.",
      author: "@Auspicious14",
      repo: "https://github.com/Auspicious14/image-generator-fe.git",
      stars: 0,
      submissionDate: "2025-05-01",
      order: 1,
    },
    {
      name: "🆕 🎨 WebGeniusAI",
      url: "https://logise.neocities.org/webgeniusai",
      description: "AI tool that generates HTML websites with visuals from Pollinations.",
      author: "@logise",
      submissionDate: "2025-04-30",
      order: 1
    },
    {
      name: "🆕 NailsGen",
      url: "https://www.nailsgen.com/",
      description: "Create beautiful nail art designs with AI. Generate unique nail art designs with different styles and colors.",
      author: "lipengliang2012@163.com",
      submissionDate: "2025-04-30"
    },
    {
      name: "🆕 ImageGen AI Image",
      url: "https://imagegen.narendradwivedi.org",
      description: "A web application that utilizes Pollinations.AI API to generate images based on user-defined descriptions, with features like prompt enhancement, customizable image settings, and image download.",
      author: "https://www.linkedin.com/in/narendradwivedi",
      submissionDate: "2025-04-22",
      order: 1,
    },
    {
      name: "🆕 RuangRiung AI Image 🇮🇩",
      url: "https://ruangriung.my.id",
      description: "RuangRiung AI Image Generator ideal untuk seniman digital, desainer, atau siapa pun yang ingin mengeksplorasi kreativitas dengan bantuan AI. Tersedia dalam bahasa Inggris dan Indonesia, website ini menggabungkan fungsionalitas lengkap dengan desain yang elegan dan responsif. (RuangRiung AI Image Generator is ideal for digital artists, designers, or anyone who wants to explore creativity with AI assistance. Available in English and Indonesian, this website combines complete functionality with an elegant and responsive design.)",
      author: "@ruangriung",
      repo: "https://github.com/ruangriung",
      submissionDate: "2025-04-20",
      language: "id-ID",
      order: 1,
    },
    {
      name: "🆕 BlackWave",
      url: "https://blackwave.studio/",
      description: "An AI image generator that creates unique images from text prompts. Fast, easy and free!",
      author: "@metimol",
      submissionDate: "2025-04-19",
      order: 1,
    },
    {
      name: "🆕 Generator Text AI 🇮🇩",
      url: "https://app.ariftirtana.my.id/",
      description: "Generator Teks AI canggih dengan berbagai model AI seperti OpenAI, Llama, Mistral, dan DeepSeek. Hasilkan jawaban instan, dukung mode gelap/fokus, riwayat percakapan, dan contoh pertanyaan acak. Alat sempurna untuk kreativitas dan produktivitas. (Advanced AI Text Generator with various AI models like OpenAI, Llama, Mistral, and DeepSeek. Generate instant answers, support dark/focus mode, conversation history, and random question examples. Perfect tool for creativity and productivity.)",
      author: "@ayick13",
      repo: "https://github.com/ayick13/app",
      stars: 0,
      submissionDate: "2025-04-16",
      language: "id-ID",
      order: 2,
    },
    {
      name: "🆕 🌱 Strain Navigator",
      url: "https://www.strainnavigator.com/",
      description: "A collection of tools to help Growers, Breeders & Seed Bankers. Free & Open Source powered by Pollinations.ai.",
      author: "@Tolerable",
      repo: "https://github.com/Tolerable/strainnavigator",
      stars: 1,
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "🆕 MalaysiaPrompt 🇲🇾",
      url: "https://malaysiaprompt.rf.gd/",
      description: "A free and fun platform for creating unique AI-generated images. No fancy skills needed – just your ideas and a few clicks to bring them to life. Features image generation, text-to-prompt conversion, and image-to-text capabilities.",
      author: "@enciksnow",
      authorUrl: "https://x.com/enciksnow",
      submissionDate: "2025-04-15",
      language: "ms-MY",
      order: 3,
    },
    {
      name: "🆕 Generator AI Image 🇮🇩",
      url: "https://kenthir.my.id/advanced-generator/",
      description: "Advanced AI Image Generator adalah platform inovatif yang memungkinkan Anda membuat gambar digital menakjubkan dengan kecerdasan buatan by pollinations.ai. Dengan dukungan berbagai model AI canggih seperti DALL·E 3, Stable Diffusion, dan Flux-Default. (An innovative platform that allows you to create amazing digital images with artificial intelligence powered by pollinations.ai. Supports various advanced AI models like DALL-E 3, Stable Diffusion, and Flux-Default.)",
      author: "@kenthirai",
      submissionDate: "2025-04-15",
      language: "id-ID",
      order: 1,
    },
    {
      name: "🆕 Pollinations.ai Image Generation (for Frame)",
      url: "https://github.com/CitizenOneX/frame_pollinations",
      description: "A Flutter application that listens for image generation prompts, requests images from Pollinations.AI, and displays them on the Frame wearable device. Users can use voice commands to generate images and save/share them using the device's sharing mechanism.",
      author: "CitizenOneX",
      repo: "https://github.com/CitizenOneX/frame_pollinations",
      submissionDate: "2025-04-13",
      stars: 3,
      order: 3,
    },
    {
      name: "🆕 Podcast #1500",
      url: "https://open.spotify.com/show/1wu4ngb1dclyTwoNN4cZzK",
      description: "Podcast project powered by pollinations, featuring dialogues among LLMs. First episode features 3o-mini and DeepSeek R1 70B talking about Vibe Coding.",
      author: "@brain.diver",
      submissionDate: "2025-03-31",
      order: 1,
    },
    {
      name: "🆕 LAHGen",
      url: "https://image.aixboost.com/",
      description: "An advanced AI-driven text-to-image generation platform designed to provide users with high-quality and realistic AI-generated images based on textual prompts. The platform allows users to generate unlimited AI images for free, leveraging cutting-edge AI models to produce stunning visual outputs in various artistic styles.",
      author: "working7816@gmail.com",
      submissionDate: "2025-03-31",
      order: 1,
    },
    {
      name: "🆕 Elixpo Art",
      url: "https://elixpoart.vercel.app",
      description: "A Web interface to create thematic images from prompts, with multiple aspect ratios and also image reference inputs.",
      author: "Ayushman Bhattacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter",
      stars: 8,
      submissionDate: "2025-03-31",
      order: 3,
    },
    {
      name: "🆕 Riffle",
      url: "https://riffle.ink",
      description: "A powerful tool designed to make reading English books more enjoyable and effective while helping you build your vocabulary naturally. Using Pollinations AI to create content that incorporates your own vocabulary words allows you to learn them in a vivid, engaging context.",
      author: "gsx123@gmail.com",
      submissionDate: "2025-03-28",
      order: 1,
    },
    {
      name: "🆕 AI 文本转音频 🇨🇳",
      url: "https://tts-gules-theta.vercel.app/",
      description: "输入文本，选择语音风格，一键将文字转换为自然流畅的语音。 支持多种声音特征，帮您创建专业水准的音频内容。 (Input text, select voice style, and instantly convert text to natural, fluid speech. Supports various voice characteristics to help you create professional-quality audio content.)",
      author: "https://github.com/Azad-sl",
      repo: "https://github.com/Azad-sl/tts",
      stars: 2,
      submissionDate: "2025-03-24",
      language: "zh-CN",
      hidden: true,
      order: 5,
    },
    {
      name: "🆕 Case Me 🇧🇷",
      description: "O projeto consiste em uma vending machine que criará capinhas para celular personalizadas com fotos ou outras imagens e cores de escolha do cliente final. (A vending machine that creates customized phone cases with photos or other images and colors chosen by the end customer.)",
      author: "anaboxmania@gmail.com",
      submissionDate: "2025-03-19",
      language: "pt-BR",
      order: 2,
    },
    {
      name: "🆕 PixPax",
      url: "https://pixpal.chat",
      description: "A user-friendly chatbot that lets you analyze images, remix existing images or create new images, all through simple chat.",
      author: "@andreas_11",
      submissionDate: "2025-03-17",
      order: 2,
    },
    {
      name: "🆕 Watch TV with neko (Roblox)",
      url: "https://www.roblox.com/games/15087497266/UPD-Watch-TV-with-neko-AI",
      description: "Roblox game where you can talk with AI catgirls 🐾 or just have fun, talking with other players in cozy rooms ⭐️",
      author: "https://www.roblox.com/users/3857849039/profile/",
      submissionDate: "2025-03-17",
      order: 2,
    },
    {
      name: "🆕 Jenny AI",
      url: "https://jenny-two.vercel.app/",
      description: "Jenny AI is an AI chatbot and character creation platform with tts and sst it also has image generation and vision ability which are powered by pollinations.",
      author: "https://www.linkedin.com/in/pritam-roy-95185328a",
      submissionDate: "2025-03-16",
      order: 3,
    },
    {
      name: "🆕 CalcuBite AI",
      url: "https://calcubite.vercel.app/",
      description: "CalcuBite AI is a smart tool that analyzes food from images to provide calorie and nutrient details. Just take a photo, and it quickly gives you an estimate of your meal's nutritional value. It uses AI for accurate analysis, and if you run out of free scans, you can watch an ad to get more!",
      author: "@sugamdeol",
      submissionDate: "2025-03-15",
      order: 1,
    },
    {
      name: "🆕 RoastMaster AI",
      url: "https://roastmaster-ai.vercel.app/",
      description: "An AI-powered roast generator that allows users to upload selfies for savage AI-generated roasts, enter text for brutal critiques, or engage in roast battles. Images are processed securely on the device, protecting user privacy.",
      author: "@sugamdeol",
      submissionDate: "2025-03-14",
      order: 1,
    },
    {
      name: "🆕 roastmyselfie.app",
      url: "https://roastmyselfie.app",
      description: "AI Personality Analyzer - Get roasted and psychoanalyzed.. just from one selfie! Dare to try?",
      author: "@andres_11",
      submissionDate: "2025-03-14",
      order: 2,
    },
    {
      name: "🆕 StoryMagic: Interactive Kids Stories",
      url: "https://storyai-wizard.vercel.app",
      description: "An interactive web application designed to create engaging and customizable stories for children. Users can generate creative narratives with personalized settings, characters, and themes. The project leverages AI to enhance storytelling with text generation, dynamic visuals, and interactive features.",
      author: "@_dr_misterio_",
      submissionDate: "2025-03-14",
      order: 1,
    },
    {
      name: "🆕 PromptPix (Android)",
      url: "https://expo.dev/accounts/aminmusah/projects/image-generator/builds/ed32c5d0-83c0-416b-889f-e36b997dd706",
      description: "An AI-powered image generation platform for Android designed to create stunning visuals from text prompts. Features dynamic image generation as users scroll, save to gallery, favorites, and a user-friendly interface.",
      author: "https://discord.com/channels/@taylorsnupe",
      repo: "https://github.com/AminMusah/ai-image-generator",
      stars: 1,
      submissionDate: "2025-03-12",
      order: 2,
    },
    {
      name: "🆕 AI儿童故事 🇨🇳",
      url: "https://kidss.netlify.app/",
      description: "基于此项目 构建有趣的孩子故事书应用演示 (Based on this project, build an interesting children's storybook application demo)",
      author: "MZ",
      submissionDate: "2025-03-10",
      language: "zh-CN",
      order: 4,
    },
    {
      name: "🆕 Herramientas IA",
      url: "https://proyectodescartes.org/descartescms/herramientas-ia",
      description: "Tools designed with Pollinations.AI and the DescartesJS editor, including tools from other Pollinations.AI community members.",
      author: "@juanrivera126",
      submissionDate: "2025-03-10",
      order: 4,
    },
    {
      name: "🆕 AvatarStudio",
      url: "https://astudio-dcae4.web.app",
      description: "A system for creating custom characters that uses the Pollinations API for totally free and unlimited image generation.",
      author: "@nic-wq",
      submissionDate: "2025-03-10",
      order: 2,
    },
    {
      name: "🆕 Musify - AI Enhanced Music Streaming",
      url: "https://musify-sd.vercel.app/",
      description: "Musify is your AI-powered music buddy, making your jam sessions smarter and more fun. It is powered by pollinations api, it offers a slick and intuitive music experience with features like AI Music Assistant, Voice Commands, AI Playlist Creator, and Responsive Design.",
      author: "@Sugamdeol",
      submissionDate: "2025-02-27",
      order: 4,
    },
    {
      name: "🆕 image1gen",
      url: "https://image1gen.streamlit.app/",
      description: "Website to easily create images via pollinations.ai API.",
      author: "@oopshnik",
      repo: "https://github.com/oopshnik/image1gen",
      stars: 8,
      submissionDate: "2025-02-22",
      order: 2,
    },
    {
      name: "🆕 AI Image Generator",
      url: "https://fvai.infinityfreeapp.com/my-apps/pollicb09.html",
      description: "A web-based AI image generator powered by Pollinations.ai, featuring multi-model support, customizable parameters, and real-time preview.",
      author: "@hrisjeui",
      repo: "https://github.com/hrisjeui/Multi-text-image-model-pollinations",
      stars: 2,
      submissionDate: "2025-02-15",
      order: 3,
    },
    {
      name: "🎵 PolliSonic Generator",
      url: "https://interzone.art.br/pollisonic_generator/",
      description: "An AI-driven tool that transforms text prompts using MidiJourney into MIDI-based melodies through browser oscillators.",
      author: "@brain.diver",
      repo: "https://github.com/rafabez/pollisonic_generator",
      stars: 0,
      order: 1,
    },
    {
      name: "Abyss Ascending",
      url: "https://interzone.art.br/abyss_ascending/",
      description: "A web-based generative interactive fiction (text adventure) set in a sci-fi underwater world.",
      author: "@brain.diver",
      repo: "https://github.com/rafabez/abyss_ascending",
      stars: 0,
      order: 1,
    },
    {
      name: "Deep Saga",
      url: "https://play.google.com/store/apps/details?id=com.cestrian.deepsaga.android&pcampaignid=pollinations",
      description: "A text based RPG available on Android with AI-generated scene images.",
      author: "@jr_7_77",
      order: 2,
    },
    {
      name: "[AI] Character RP (Roblox)",
      url: "https://www.roblox.com/games/108463136689847/AI-Character-RP",
      description: "A popular Roblox game for AI character roleplay.",
      author: "[user113](https://www.roblox.com/users/5810708209)",
      order: 1,
    },
    {
      name: "MIDIjourney",
      url: "https://github.com/korus-labs/MIDIjourney",
      description: "An AI-powered plugin for Ableton Live that turns text descriptions into music.",
      author: "KORUS Labs",
      order: 1,
    },
    {
      name: "TurboReel",
      url: "https://turboreelgpt.tech/",
      description: "An open-source video generation system using AI.",
      author: "@pedroriosa",
      repo: "https://github.com/TurboReel/mediachain",
      stars: 42,
      hidden: true,
      order: 5,
    },
    {
      name: "Rangrez AI",
      url: "https://rangrezai.com",
      description: "A web platform for inspiring, creating, and customizing designs.",
      author: "@saadaryf",
      order: 3,
    },
    {
      name: "Infinite Tales",
      url: "https://infinite-tales-rpg.vercel.app/",
      description: "A Choose Your Own Adventure RPG, dynamically narrated by AI.",
      author: "JayJayBinks",
      repo: "https://github.com/JayJayBinks/infinite-tales-rpg",
      stars: 21,
      order: 3,
    },
    {
      name: "StorySight",
      url: "https://github.com/abiral-manandhar/storySight",
      description: "An app to help children with learning disabilities.",
      order: 2,
    },
    {
      name: "StoryWeaver",
      url: "https://devpost.com/software/storyweaver-013xdw",
      description: "Crafts personalized picture books for children.",
      author: "Multiple Authors",
      hidden: true,
      order: 5,
    },
    {
      name: "Sirius Cybernetics Elevator Challenge",
      url: "https://sirius-cybernetics.pollinations.ai/",
      description: "A Hitchhiker's Guide to the Galaxy themed LLM-based elevator game.",
      author: "@thomash_pollinations",
      repo: "https://github.com/voodoohop/sirius-cybernetics-elevator-challenge",
      stars: 0,
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
  toolsInterfaces: [
    {
      name: "🆕 NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "🆕 B&W SVG Generator",
      url: "https://fluxsvggenerator.streamlit.app/",
      description: "Uses Flux (through pollinations) and potrace to create B&W Vector files",
      author: "@pointsguy118",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "🆕 Imagen",
      url: "https://altkriz.github.io/imagen/",
      description: "A beautiful web interface for generating images using Pollinations.ai API with only the \"flux\" and \"turbo\" models.",
      author: "@altkriz",
      repo: "https://github.com/altkriz/imagen",
      stars: 3,
      submissionDate: "2025-04-13",
      order: 2,
    },
    {
      name: "🆕 DominiSigns",
      description: "Avatar Translator for Dominican Sign Language that uses artificial intelligence to translate text and audio into Dominican sign language (LSRD), creating a communication bridge for approximately 100,000 deaf people in the Dominican Republic.",
      author: "@cmunozdev",
      repo: "https://github.com/cmunozdev/DominiSigns",
      stars: 3,
      submissionDate: "2025-04-06",
      order: 2,
    },
    {
      name: "🆕 WordPress AI Vision Block",
      url: "https://wordpress.org/plugins/ai-vision-block/",
      description: "A custom WordPress Gutenberg block that allows you to generate images using the Pollinations API. Simply enter a prompt, and the AI will generate an image for you. Once the post is saved, the image is automatically stored in the WordPress Media Library.",
      author: "mahmood-asadi",
      repo: "https://github.com/mahmood-asadi/ai-vision-block",
      stars: 5,
      submissionDate: "2025-03-31",
      order: 2,
    },
    {
      name: "🆕 toai.chat",
      url: "https://toai.chat",
      description: "An AI chat service that operates exclusively via Curl commands, specifically designed for users working in terminal environments without the need for a standalone AI client.",
      author: "kevin@kevin1986.com",
      repo: "https://github.com/Veallym0n/toai.chat",
      stars: 2,
      submissionDate: "2025-03-27",
      hidden: true,
      order: 5,
    },
    {
      name: "🆕 Elixpo Art Chrome Extension",
      url: "https://chromewebstore.google.com/detail/elixpo-art-select-text-an/hcjdeknbbbllfllddkbacfgehddpnhdh",
      description: "It uses the pollinations image endpoint to generate an image with `boltning` as the model in 4 types of aspect ratios and themes with prompt engineering thus transforming selected texts into art smoothly with a disposable GUI in web.",
      author: "Ayushman Bhatacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter/tree/main/Elixpo%20Chrome%20%20Extension",
      stars: 8,
      submissionDate: "2025-03-14",
      order: 4,
    },
    {
      name: "🆕 Pollinations Feed",
      url: "https://elixpoart.vercel.app/src/feed",
      description: "Builds a bentro grid UI which integrates with the pollinations realtime SSE feed to show case art generation, with virtual DOM update to reduce lag and optimization.",
      author: "Ayushman Bhattacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter",
      stars: 8,
      submissionDate: "2025-03-14",
      order: 3,
    },
    {
      name: "🆕 Pollinations.ai Model Comparison",
      url: "https://endemicmedia.github.io/FLARE/llm-comparison-tool/",
      description: "An interactive tool designed to compare outputs from various large language models with customizable timeout settings and real-time testing capabilities.",
      author: "https://github.com/dseeker",
      repo: "https://github.com/EndemicMedia",
      submissionDate: "2025-02-16",
      order: 4,
    },
    {
      name: "🆕 Anime AI Generation",
      url: "https://www.animeaigeneration.com/",
      description: "Create professional-quality anime characters with powerful AI technology. No artistic skills required.",
      author: "@shreyas281898",
      submissionDate: "2025-02-11",
      order: 3,
    },
    {
      name: "🆕 Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated Pollinations AI services, visual code editing, and project management tools.",
      author: "@thomash_pollinations",
      repo: "https://github.com/pollinations/pollinations.diy",
      stars: 5,
      order: 1,
    },
    {
      name: "Pal Chat",
      url: "https://apps.apple.com/us/app/pal-chat-ai-chat-client/id6447545085?platform=iphone",
      description: "An iOS app that integrates with all LLMs including Pollinations AI models in one unified simple interface.",
      author: "https://x.com/pallavmac",
      order: 1,
    },
    {
      name: "Pollinator Android App",
      url: "https://github.com/g-aggarwal/Pollinator",
      description: "An open-source Android app for text-to-image generation.",
      author: "@gaurav_87680",
      order: 2,
    },
    {
      name: "Own-AI",
      url: "https://own-ai.pages.dev/",
      description: "An AI text-to-image generator.",
      author: "Sujal Goswami",
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
      name: "Image Gen - Uncensored Edition",
      url: "https://huggingface.co/chat/assistant/66fccce0c0fafc94ab557ef2",
      description: "A powerful image generation assistant on HuggingChat.",
      author: "@DeFactOfficial",
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
      name: "JCode Website Builder",
      url: "https://jcode-ai-website-bulder.netlify.app/",
      description: "A website generator using Pollinations text API.",
      author: "@rtxpower",
      order: 3,
    },
    {
      name: "Server Status Dashboards",
      url: "https://www.ai-ministries.com/serverstatus.html",
      description: "Real-time monitoring dashboards for Pollinations text and image servers.",
      author: "@tolerantone",
      order: 1,
    },
    {
      name: "Websim",
      url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
      description: "A web simulation tool that integrates Pollinations.ai.",
      author: "@thomash",
      order: 2,
    },
  ],
  socialBots: [
    {
      name: "🆕 🤖 Raftar.xyz",
      url: "https://raftar.xyz",
      description: "A Discord multi-purpose bot with over 100+ commands, including AI image generation, ChatGPT, and SearchGPT powered by Pollinations.AI.",
      author: "@goodgamerhere",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "🆕 AlphaLLM - AI Discord Bot",
      url: "https://alphallm.fr.nf",
      description: "Discord bot that uses several APIs (Pollinations AI and Cerebras AI), to offer a variety of features, including advanced text generation with a history of your conversations, image and voice generation.",
      author: "@the_yerminator",
      repo: "https://github.com/YoannDev90/AlphaLLM",
      stars: 5,
      submissionDate: "2025-03-31",
      order: 5,
    },
    {
      name: "🆕 🤖 pollinations-tg-bot 🇨🇳",
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
      name: "🆕 Gacha",
      url: "https://shapes.inc/gacha-gachu/public",
      description: "A versatile AI chat-bot and image generator powered by Pollinations.AI, featuring web search, image generation with model selection, and character-aware image generation through !webgen command.",
      author: "@_dr_misterio_",
      submissionDate: "2025-02-24",
      order: 1,
    },
    {
      name: "🆕 One Word",
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
      name: "🆕 Pollinations Task Master",
      url: "https://github.com/LousyBook94/pollinations-task-master",
      description: "A fork of the original task master but uses pollinations instead to be used for free. Has both a CLI and MCP and distributed as an npm package now as \"pollinations-taskmaster\".",
      author: "@LousyBook94",
      repo: "https://github.com/LousyBook94/pollinations-task-master",
      stars: 3,
      submissionDate: "2025-05-04",
      order: 2,
    },
    {
      name: "🆕 Mimir AIP",
      url: "https://mimir-aip.github.io/",
      description: "An open-source AI pipeline framework designed to simplify the integration and orchestration of various AI models and services. The platform provides a modular architecture that allows developers to easily build, test, and deploy AI-powered applications with support for Pollinations.ai as a provider.",
      author: "@CiaranMcAleer",
      repo: "https://github.com/Mimir-AIP/Mimir-AIP",
      submissionDate: "2025-05-01",
      stars: 0,
      order: 1,
    },
    {
      name: "🆕 ComfyUI-Pollinations",
      url: "https://github.com/1038lab/ComfyUI-Pollinations",
      description: "A custom node for ComfyUI that utilizes the Pollinations API to generate images and text based on user prompts, supporting multiple image and text generation models.",
      author: "https://github.com/1038lab/",
      repo: "https://github.com/1038lab/ComfyUI-Pollinations",
      submissionDate: "2025-03-04",
      stars: 29,
      order: 2,
    },
    {
      name: "🆕 Node.js Client Library",
      url: "https://www.npmjs.com/package/pollinationsai",
      description: "A TypeScript/Node.js client for accessing Pollinations AI services including image generation, text processing, and speech synthesis. Features full TypeScript typings, dual CJS/ESM module support, 100% test coverage and feed/streams support, builder pattern API and axios-based HTTP client implementation.",
      author: "@fqueis",
      repo: "https://github.com/fqueis/pollinationsai",
      submissionDate: "2025-03-14",
      stars: 11,
      order: 2,
    },
    {
      name: "🆕 MCPollinations",
      url: "https://github.com/pinkpixel-dev/MCPollinations",
      description: "A Model Context Protocol (MCP) server that enables AI assistants to generate images, text, and audio through the Pollinations APIs. Supports customizable parameters, image saving, and multiple model options.",
      author: "Pink Pixel",
      repo: "https://github.com/pinkpixel-dev/MCPollinations",
      submissionDate: "2025-04-13",
      stars: 6,
      order: 2,
    },
    {
      name: "🆕 pollinations_ai",
      url: "https://pub.dev/packages/pollinations_ai",
      description: "A Flutter/Dart SDK package for accessing all features of pollinations.ai including text generation, image generation, audio, and listing all supported models.",
      author: "@Meenapintu",
      repo: "https://github.com/yehigo/pollinations.ai",
      submissionDate: "2025-03-31",
      stars: 4,
      order: 2,
    },
    {
      name: "🆕 Smpldev",
      url: "https://smpldev.ftp.sh/",
      description: "Create, deploy, and scale full-stack web and mobile applications in minutes.",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 1,
    },
    {
      name: "pollinations NPM Module",
      url: "https://www.npmjs.com/package/pollinations",
      description: "A Node.js package for accessing all Pollinations features.",
      author: "@maxencexz",
      order: 2,
    },
    {
      name: "pypollinations",
      url: "https://pypi.org/project/pypollinations/",
      description: "Comprehensive Python wrapper for Pollinations AI API.",
      author: "@KTS-o7",
      order: 2,
    },
    {
      name: "@pollinations/react",
      url: "https://www.npmjs.com/package/@pollinations/react",
      description: "React hooks for easy integration of Pollinations' features.",
      author: "@pollinations",
      order: 2,
    },
    {
      name: "Polli API Dashboard",
      url: "https://polli-api.vercel.app",
      description: "Real-time dashboard monitoring text.pollinations.ai/feed.",
      author: "@Sugamdeol",
      order: 1,
    },
    {
      name: "pollinations.ai Python SDK",
      url: "https://github.com/pollinations-ai/pollinations.ai",
      description: "Official Python SDK for working with Pollinations' models.",
      author: "@pollinations-ai",
      order: 2,
    },
  ],
  tutorials: [
    {
      name: "🆕 Pollinations.AI AI/Teens talk",
      url: "https://www.youtube.com/live/5Rvdfr2qYGA?si=i5NLOKI49fGxNAEK&t=1034",
      description: "Session 2: ai/teens worldwide conference exploring the forces shaping AI today, diving into governance, virtual connections, and decision-making with voices from multiple European cities.",
      author: "@thomash_pollinations",
      submissionDate: "2025-04-15",
      order: 2,
    },
    {
      name: "🆕 Connect Pollinations with Open Web UI tutorial",
      url: "https://github.com/cloph-dsp/Pollinations-AI-in-OpenWebUI",
      description: "How to add Pollinations AI Text Models to OpenWebUI for free access to top language models like GPT-4o, Mistral, Claude, and Gemini without signups or API keys.",
      author: "@cloph-dsp",
      repo: "https://github.com/cloph-dsp/Pollinations-AI-in-OpenWebUI",
      stars: 6,
      submissionDate: "2025-03-22",
      order: 2,
    },
    {
      name: "🆕 Chinese DeepSeek Tutorial",
      url: "https://linux.do/t/topic/447840/235",
      description: "A tutorial showing how to make DeepSeek AI support image generation by leveraging Pollinations.ai's API.",
      author: "https://linux.do/u/isinry",
      submissionDate: "2025-03-04",
      order: 2,
    },
    {
      name: "Artistic Styles Book",
      url: "https://proyectodescartes.org/iCartesiLibri/materiales_didacticos/Libro_Estilos/index.html",
      description: "An interactive book showcasing 90+ artistic styles.",
      author: "Juan Gmo. Rivera",
      order: 2,
    },
    {
      name: "Proyecto Descartes",
      url: "https://proyectodescartes.org/revista/Numeros/Revista_8_2024/index.html",
      description: "Educational initiative integrating Pollinations AI into STEM.",
      author: "Juan Gmo. Rivera",
      order: 2,
    },
    {
      name: "Tutorial",
      url: "https://guiadehospedagem.com.br/pollinations-ai/",
      description: "An in-depth Portuguese tutorial on using Pollinations AI.",
      author: "Janderson de Sales",
      order: 2,
    },
    {
      name: "Apple Shortcuts Guide",
      url: "https://www.youtube.com/watch?v=-bS41VTzh_s",
      description: "Video guide on creating AI images using Apple Shortcuts.",
      author: "RoutineHub",
      order: 2,
    },
  ],
};

export const projects = {
  featured: [],
  llmIntegrations: [],
  creativeApps: [],
  toolsInterfaces: [],
  socialBots: [],
  sdkLibraries: [],
  tutorials: [],
};

/**
 * Remove the "🆕" emoji from project names that:
 * 1. Have a submission date older than 15 days
 * 2. Have no submission date at all
 *
 * @param {Object} project - The project object
 * @returns {Object} - Project with potentially modified name
 */
const processProjectName = (project) => {
  const result = { ...project };
  
  // If the project has no submissionDate or it's older than 15 days, remove the "🆕" emoji
  if (!result.submissionDate || isOlderThan15Days(result.submissionDate)) {
    if (result.name && result.name.includes("🆕")) {
      result.name = result.name.replace("🆕", "").trim();
    }
  }
  
  return result;
};

/**
 * Check if a date is older than 15 days from today
 *
 * @param {string} dateString - Date in format "YYYY-MM-DD"
 * @returns {boolean} - True if the date is older than 15 days
 */
const isOlderThan15Days = (dateString) => {
  if (!dateString) return true;
  
  try {
    const submissionDate = new Date(dateString);
    const today = new Date();
    const differenceInTime = today - submissionDate;
    const differenceInDays = differenceInTime / (1000 * 3600 * 24);
    
    return differenceInDays > 15;
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
    const orderA = a.order || 3; // Default to middle order (3) if not specified
    const orderB = b.order || 3;
    
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
    
    // Find the top 5 projects with order=1, prioritizing by stars and then recency
    const order1Projects = sourceProjects[category]
      .filter(project => (project.order === 1 || project.order === "1") && !project.hidden)
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
      .slice(0, 3); // Take top 3
    
    // Create a set of project names that should be featured
    const featuredProjectNames = new Set(order1Projects.map(project => 
      project.name.replace("🆕", "").trim()
    ));

    sourceProjects[category].forEach(project => {
      // Skip hidden projects
      if (project.hidden) {
        return;
      }
      
      // Process the project name (remove 🆕 if necessary)
      const processedProject = processProjectName(project);
      
      // Get normalized name without emoji for checking
      const normalizedName = processedProject.name.replace("🆕", "").trim();

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

// Export the final projects object
Object.keys(projects).forEach(category => {
  projects[category] = organizedProjects[category];
});

