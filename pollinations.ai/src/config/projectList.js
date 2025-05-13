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
      name: "🆕 NetSim",
      url: "https://netsim.us.to/",
      description: "websim.ai clone that's actually good",
      author: "@kennet678",
      submissionDate: "2025-04-15",
      order: 2,
    },
  ],
  toolsInterfaces: [
    {
      name: "🆕 tgpt",
      url: "https://github.com/aandrew-me/tgpt",
      description: "AI Chatbots in terminal without needing API keys - a command-line interface for AI that appeals to developers and terminal users.",
      author: "@aandrew-me",
      repo: "https://github.com/aandrew-me/tgpt",
      submissionDate: "2025-05-10",
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
      url: "https://github.com/mahmood-asadi/ai-vision-block",
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
      description: "An iOS app that integrates with all LLMs including Pollinations AI models in one unified simple interface.",
      author: "Ayushman Bhatacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter/tree/main/Elixpo%20Chrome%20%20Extension",
      stars: 8,
      submissionDate: "2025-03-14",
      order: 4,
    },
    {
      name: "🆕 Pollinations Feed",
      url: "https://elixpoart.vercel.app/src/feed",
      description: "A feed of images generated using Pollinations.ai, with options to like, share, and download.",
      author: "Ayushman Bhattacharya",
      submissionDate: "2025-03-14",
      order: 4,
    },
    {
      name: "🆕 Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated Pollinations AI services, visual code editing, and project management tools.",
      author: "@thomash",
      submissionDate: "2025-03-01",
      order: 3,
    },
    {
      name: "🆕 Anime Character Generator",
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
      name: "Aiphoto智能绘画 🇨🇳",
      url: "https://qiyimg.3d.tc/Aiphoto",
      description: "AI艺术工坊 - 智能绘画生成器。这是一个基于AI的绘画生成工具，可以根据用户输入的中文描述自动生成相应的图片。(An AI art workshop - intelligent painting generator. This is an AI-based painting generation tool that can automatically generate images based on Chinese descriptions input by users.)",
      author: "@qiyimg",
      submissionDate: "2025-05-11",
      order: 1,
    },
    {
      name: "🆕 LiteAI",
      url: "https://github.com/LostRuins/lite.koboldai.net",
      description: "A lightweight AI framework for text generation and chat.",
      author: "@lostruins",
      repo: "https://github.com/LostRuins/lite.koboldai.net",
      stars: 3700,
      submissionDate: "2025-05-09",
      order: 0,
    },
    {
      name: "🆕 Polynate",
      url: "https://polynate.cloudwerx.dev/",
      description: "AI-powered text and audio content generation platform providing a user-friendly interface for interacting with various AI generation services from Pollinations.ai.",
      author: "@fisven",
      repo: "https://github.com/fisventurous/pollinationsai-enhancer",
      stars: 0,
      submissionDate: "2025-04-27",
      order: 1,
    },
    {
      name: "VibeCoder",
      url: "https://vibecoderbyaashir.netlify.app/",
      description: "A web app for coding with vibes, created using Pollinations.AI Open Source API without coding syntax.",
      author: "@Aashir__Shaikh",
      authorUrl: "https://x.com/Aashir__Shaikh",
      submissionDate: "2025-03-25",
      order: 1,
    },
    {
      name: "🆕 Pollinations.AI Enhancer",
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
      name: "🆕 Define",
      url: "https://define-i05a.onrender.com/api/docs/",
      description: "An AI-powered REST API designed to generate definitions for words or phrases, constrained to a specified target word count. It allows customization of tone, context, and language, delivering precise, context-aware definitions programmatically—ideal for developers and content creators.",
      author: "@hasanraiyan",
      repo: "https://github.com/hasanraiyan",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "🆕 CoNavic",
      url: "https://github.com/mkantwala/CoNavic/",
      description: "A browser extension for AI-assisted browser automation.",
      author: "@mkantwala",
      repo: "https://github.com/mkantwala/CoNavic",
      stars: 0,
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "🆕 Foodie AI",
      url: "https://foodie-ai.vercel.app/",
      description: "An AI application for food analysis that uses advanced artificial intelligence technology to help users understand food ingredients, nutritional value, and health impacts. Provides food safety analysis, nutritional health assessment, sports and fitness analysis, visual display, alternative recommendations, and practical insights for different dietary habits.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-05-06",
      order: 1,
    },
    {
      name: "🆕 LobeChat",
      url: "https://github.com/lobehub/lobe-chat",
      description: "An open-source, modern-design ChatGPT/LLMs UI/Framework with speech-synthesis, multi-modal, and extensible plugin system.",
      author: "@arvinxx",
      repo: "https://github.com/lobehub/lobe-chat",
      stars: 12000,
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations.AI 中文",
      url: "https://pollinations.vercel.app",
      description: "我们提供高质量的AI生成服务，包括图像生成、文本生成、音频生成和语音转文本服务， 让您轻松创建各种创意内容。 (We provide high-quality AI generation services, including image generation, text generation, audio generation, and speech to text services, allowing you to easily create various creative content.)",
      author: "@pollinations",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Quicker Pollinations AI",
      url: "https://getquicker.net/Sharedaction?code=9ac738ed-a4b2-4ded-933c-08dd5f710a8b&fromMyShare=true",
      description: "This project provides a free API interface supporting various text and image generation models, including OpenAI's GPT-4, Gemini 2.0, etc. Users can access these models without an API key to perform text generation, image generation, translation, text polishing, and more.",
      author: "@Quicker",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations Chatbot",
      url: "https://pollinations-chatbot.vercel.app/",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@Aashir__Shaikh",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 OkeyMeta",
      url: "https://okeymeta.com",
      description: "An LLM created by Africans to understand and have cultural awareness of African contexts and languages, OkeyAI outperforms many LLM models based on size and intelligence, OkeyMeta uses pollination image generating API to train it's LLM (OkeyAI) on images in real time.",
      author: "@okeymeta",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Snarky Bot",
      url: "https://snarkybot.vercel.app/",
      description: "A snarky bot based on Llama that is 100% free, powered by the Pollinations text API and OpenWebUI. Other models are available as well.",
      author: "@snarkybot",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Playground",
      url: "https://pollinations-ai-playground.vercel.app/",
      description: "An AI application platform based on Pollinations.AI API, providing free and unlimited AI chat assistant, image generation, and voice synthesis services.",
      author: "@playground",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Free API",
      url: "https://pollinations-ai-free-api.vercel.app/",
      description: "This project provides a free API interface supporting various text and image generation models, including OpenAI's GPT-4, Gemini 2.0, etc. Users can access these models without an API key to perform text generation, image generation, translation, text polishing, and more.",
      author: "@freeapi",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Chatbot",
      url: "https://pollinations-ai-chatbot.vercel.app/",
      description: "A chat bot integrating Pollinations API for text and image generation.",
      author: "@chatbot",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Image Generator",
      url: "https://pollinations-ai-image-generator.vercel.app/",
      description: "An AI-powered image generation platform for Android designed to create stunning visuals from text prompts. Features dynamic image generation as users scroll, save to gallery, favorites, and a user-friendly interface.",
      author: "@imagegen",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Herramientas IA",
      url: "https://herramientas.ia",
      description: "Tools designed with Pollinations.AI and the DescartesJS editor, including tools from other Pollinations.AI community members.",
      author: "@herramientas",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Video Generator",
      url: "https://pollinations-ai-video-generator.vercel.app/",
      description: "An open-source video generation system using AI.",
      author: "@videogen",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Game",
      url: "https://pollinations-ai-game.vercel.app/",
      description: "A Hitchhiker's Guide to the Galaxy themed LLM-based elevator game.",
      author: "@game",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 Pollinations AI Pipeline",
      url: "https://pollinations-ai-pipeline.vercel.app/",
      description: "An open-source AI pipeline framework designed to simplify the integration and orchestration of various AI models and services. The platform provides a modular architecture that allows developers to easily build, test, and deploy AI-powered applications with support for Pollinations.ai as a provider.",
      author: "@pipeline",
      submissionDate: "2025-05-05",
      order: 1,
    },
    {
      name: "🆕 ai/teens worldwide",
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
  llmIntegrations: [],
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