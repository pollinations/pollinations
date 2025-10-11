/**
 * Project Data Conversion Script
 * 
 * Converts existing project data to the new structured format with enhanced metadata
 */

import { ProjectValidation } from '../schemas/projectSchema.js';

/**
 * Enhanced projects data with comprehensive metadata
 * This is the new structured format that replaces the individual category files
 */
export const projectsData = {
  metadata: {
    version: "2.0.0",
    lastUpdated: "2024-10-02",
    totalProjects: 0, // Will be computed
    dataSource: "pollinations-community",
    schemaVersion: "1.0.0"
  },
  
  categories: [
    {
      id: "vibeCoding",
      title: "Vibe Coding ✨",
      description: "No-code / describe-to-code playgrounds and builders",
      icon: "✨",
      color: "#FF6B6B"
    },
    {
      id: "creative", 
      title: "Creative 🎨",
      description: "Turn prompts into images, video, music, design, slides",
      icon: "🎨",
      color: "#4ECDC4"
    },
    {
      id: "games",
      title: "Games 🎲", 
      description: "AI-powered play, interactive fiction, puzzle & agent worlds",
      icon: "🎲",
      color: "#45B7D1"
    },
    {
      id: "hackAndBuild",
      title: "Hack-&-Build 🛠️",
      description: "SDKs, integration libs, extensions, dashboards, MCP servers", 
      icon: "🛠️",
      color: "#96CEB4"
    },
    {
      id: "chat",
      title: "Chat 💬",
      description: "Standalone chat UIs / multi-model playgrounds",
      icon: "💬", 
      color: "#FECA57"
    },
    {
      id: "socialBots",
      title: "Social Bots 🤖",
      description: "Discord / Telegram / WhatsApp / Roblox bots & NPCs",
      icon: "🤖",
      color: "#FF9FF3"
    },
    {
      id: "learn",
      title: "Learn 📚",
      description: "Tutorials, guides, style books & educational demos",
      icon: "📚",
      color: "#54A0FF"
    }
  ],

  projects: [
    // Example project with full metadata (DirPixel from Creative category)
    {
      id: "dirpixel-2024",
      name: "DirPixel 🎨",
      url: "https://github.com/techcow2/dir-pixel",
      description: "Sometimes creators need to replace multiple images in a directory with new ones. This tool makes it easy by scanning all images in a specified directory, then allowing you to replace them with new AI-generated images by setting either a custom prompt for individual images or a global prompt for the entire directory. Features PyQt6 GUI, maintains original filenames, supports PNG/JPG formats with automatic conversion, and provides real-time progress tracking.",
      author: "@techcow2",
      category: "creative",
      
      // Enhanced metadata
      tags: ["python", "desktop", "image-generation", "batch-processing", "productivity", "gui", "creative-tools"],
      
      techStack: {
        frontend: ["PyQt6"],
        backend: ["Python"],
        aiModels: ["Pollinations API"]
      },
      
      platforms: ["desktop"],
      accessType: "open-source",
      pollinationsFeatures: ["image-generation"],
      userBase: "creators",
      difficulty: "intermediate",
      
      repo: "https://github.com/techcow2/dir-pixel",
      submissionDate: "2025-09-26",
      language: "en-US",
      status: "active",
      order: 1,
      verified: true
    },
    
    // Pollinations MCP Server (from Hack & Build)
    {
      id: "pollinations-mcp-official",
      name: "Pollinations MCP Server (Official) 🖥️",
      url: "https://www.npmjs.com/package/@pollinations/model-context-protocol",
      description: "Official Model Context Protocol server for Pollinations AI services. Generate images, text, and audio through MCP with STDIO transport. Easy Claude Desktop integration with npx installation.",
      author: "@pollinations",
      category: "hackAndBuild",
      
      tags: ["node.js", "mcp-server", "api-integration", "typescript", "developer-tools", "ai-assistant", "claude"],
      
      techStack: {
        backend: ["Node.js", "TypeScript"],
        deployment: ["NPM"],
        aiModels: ["Pollinations API"]
      },
      
      platforms: ["api", "cli"],
      accessType: "open-source",
      pollinationsFeatures: ["image-generation", "text-generation", "audio-generation", "mcp-server"],
      userBase: "developers",
      difficulty: "intermediate",
      
      repo: "https://github.com/pollinations/pollinations/tree/main/model-context-protocol",
      submissionDate: "2025-09-01",
      language: "en-US", 
      status: "active",
      featured: true,
      order: 1,
      verified: true
    },

    // MoneyPrinterTurbo (from Creative - high star count)
    {
      id: "moneyprinter-turbo",
      name: "MoneyPrinterTurbo",
      url: "https://github.com/harry0703/MoneyPrinterTurbo",
      description: "Simply provide a topic or keyword for a video, and it will automatically generate the video content, add background music, and create a complete video.",
      author: "@harry0703",
      category: "creative",
      
      tags: ["python", "video-generation", "automation", "content-creation", "youtube", "tiktok", "social-media"],
      
      techStack: {
        backend: ["Python"],
        aiModels: ["Pollinations API", "Various TTS Services"]
      },
      
      platforms: ["desktop", "cli"],
      accessType: "open-source", 
      pollinationsFeatures: ["image-generation"],
      userBase: "creators",
      difficulty: "intermediate",
      
      repo: "https://github.com/harry0703/MoneyPrinterTurbo",
      stars: 39900,
      language: "en-US",
      status: "active",
      featured: true,
      order: 1,
      verified: true
    },

    // GPT4Free (from Chat - very high star count)
    {
      id: "gpt4free",
      name: "gpt4free",
      url: "https://github.com/xtekky/gpt4free",
      description: "The official gpt4free repository - various collection of powerful language models and AI services, providing free access to GPT-4, Claude, Gemini and more.",
      author: "xtekky",
      category: "chat",
      
      tags: ["python", "api", "free", "gpt-4", "claude", "gemini", "llm", "ai-assistant", "open-source"],
      
      techStack: {
        backend: ["Python"],
        aiModels: ["Multiple LLM APIs", "Pollinations API"]
      },
      
      platforms: ["api", "cli", "web"],
      accessType: "open-source",
      pollinationsFeatures: ["text-generation"],
      userBase: "developers",
      difficulty: "advanced",
      
      repo: "https://github.com/xtekky/gpt4free",
      stars: 65100,
      language: "en-US",
      status: "active", 
      featured: true,
      order: 1,
      verified: true
    },

    // Mindcraft (from Games)
    {
      id: "mindcraft",
      name: "Mindcraft",
      url: "https://mindcraft.riqvip.dev/",
      description: "A web-based Minecraft-inspired game where players can use natural language to interact with the world, build structures, and create experiences through AI-powered commands.",
      author: "@mindcraft_team",
      category: "games",
      
      tags: ["web", "minecraft", "nlp", "gaming", "javascript", "ai-powered", "sandbox", "multiplayer"],
      
      techStack: {
        frontend: ["JavaScript", "WebGL"],
        backend: ["Node.js"],
        aiModels: ["Pollinations API"]
      },
      
      platforms: ["web"],
      accessType: "free",
      pollinationsFeatures: ["text-generation"],
      userBase: "gamers",
      difficulty: "beginner",
      
      repo: "https://github.com/mindcraft-ce/mindcraft-ce",
      stars: 3500,
      language: "en-US",
      status: "active",
      order: 1,
      verified: true
    },

    // Raftar.xyz Discord Bot (from Social Bots)
    {
      id: "raftar-discord-bot",
      name: "🤖 Raftar.xyz",
      url: "https://discord.com/discovery/applications/1285597879020556308",
      description: "Raftar.xyz is an innovative social bot platform that uses Pollinations AI to provide Discord servers with powerful image generation, text processing, and interactive AI features.",
      author: "@raftar_official",
      category: "socialBots",
      
      tags: ["discord", "bot", "python", "social", "image-generation", "text-generation", "community"],
      
      techStack: {
        backend: ["Python", "Discord.py"],
        deployment: ["Cloud Hosting"],
        aiModels: ["Pollinations API"]
      },
      
      platforms: ["discord"],
      accessType: "free",
      pollinationsFeatures: ["image-generation", "text-generation"],
      userBase: "general",
      difficulty: "beginner",
      
      repo: "https://github.com/raftarxyz/raftar-bot",
      stars: 42,
      language: "en-US",
      status: "active",
      order: 1,
      verified: true
    },

    // LobeChat (from Chat)
    {
      id: "lobechat",
      name: "LobeChat",
      url: "https://lobechat.com",
      description: "An open-source, extensible chat UI framework supporting multiple models and providers. Features modern design, plugin system, and seamless integration with various AI services including Pollinations.",
      author: "@lobehub",
      category: "chat",
      
      tags: ["react", "typescript", "chat", "ui-framework", "open-source", "multi-model", "modern-design"],
      
      techStack: {
        frontend: ["React", "TypeScript", "Next.js"],
        backend: ["Node.js"],
        deployment: ["Vercel"],
        aiModels: ["Multiple LLM APIs", "Pollinations API"]
      },
      
      platforms: ["web"],
      accessType: "open-source",
      pollinationsFeatures: ["text-generation", "image-generation"],
      userBase: "developers",
      difficulty: "intermediate",
      
      repo: "https://github.com/lobehub/lobe-chat", 
      stars: 21000,
      language: "en-US",
      status: "active",
      featured: true,
      order: 1,
      verified: true
    },

    // Pollinations.DIY (from Vibe Coding)
    {
      id: "pollinations-diy",
      name: "Pollinations.DIY",
      url: "https://pollinations.diy",
      description: "A browser-based coding environment based on bolt.diy, featuring integrated AI assistance for rapid prototyping and development. Build web applications with natural language instructions.",
      author: "@thomash",
      category: "vibeCoding",
      
      tags: ["web", "ide", "ai-assistance", "no-code", "prototyping", "javascript", "browser-based"],
      
      techStack: {
        frontend: ["JavaScript", "Monaco Editor"],
        backend: ["WebAssembly"],
        aiModels: ["Pollinations API"]
      },
      
      platforms: ["web"],
      accessType: "free",
      pollinationsFeatures: ["text-generation"],
      userBase: "developers",
      difficulty: "beginner",
      
      language: "en-US",
      status: "active",
      featured: true,
      order: 1,
      verified: true
    },

    // Connect Pollinations tutorial (from Learn)
    {
      id: "pollinations-openwebui-tutorial",
      name: "Connect Pollinations with Open Web UI tutorial",
      url: "https://github.com/cloph-dsp/Pollinations-AI-in-OpenWebUI",
      description: "Step-by-step guide on integrating Pollinations APIs with Open Web UI for enhanced AI capabilities. Includes configuration examples, troubleshooting, and best practices.",
      author: "@cloph-dsp",
      category: "learn",
      
      tags: ["tutorial", "integration", "open-web-ui", "api", "documentation", "educational"],
      
      techStack: {
        backend: ["API Integration"],
        aiModels: ["Pollinations API", "Open Web UI"]
      },
      
      platforms: ["web"],
      accessType: "open-source",
      pollinationsFeatures: ["text-generation", "image-generation"],
      userBase: "developers",
      difficulty: "intermediate",
      
      repo: "https://github.com/cloph-dsp/Pollinations-AI-in-OpenWebUI",
      stars: 11,
      language: "en-US",
      status: "active",
      order: 1,
      verified: true
    }
  ]
};

/**
 * Data migration utilities
 */
export const DataMigration = {
  /**
   * Converts legacy project format to new structured format
   */
  convertLegacyProject(legacyProject, categoryId) {
    const project = {
      id: this.generateProjectId(legacyProject.name, legacyProject.submissionDate),
      name: legacyProject.name,
      url: legacyProject.url,
      description: legacyProject.description,
      author: legacyProject.author,
      category: categoryId,
      
      // Copy existing fields
      repo: legacyProject.repo,
      stars: legacyProject.stars,
      submissionDate: legacyProject.submissionDate,
      order: legacyProject.order || 3,
      hidden: legacyProject.hidden || false,
      
      // Auto-infer metadata
      tags: this.inferTags(legacyProject),
      techStack: this.inferTechStack(legacyProject),
      platforms: this.inferPlatforms(legacyProject),
      accessType: this.inferAccessType(legacyProject),
      pollinationsFeatures: this.inferPollinationsFeatures(legacyProject),
      userBase: this.inferUserBase(categoryId),
      difficulty: this.inferDifficulty(legacyProject),
      
      language: "en-US",
      status: "active",
      verified: false
    };
    
    return ProjectValidation.computeFields(project);
  },
  
  /**
   * Generates a unique project ID
   */
  generateProjectId(name, submissionDate) {
    const cleanName = name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    
    const year = submissionDate ? new Date(submissionDate).getFullYear() : new Date().getFullYear();
    return `${cleanName}-${year}`;
  },
  
  /**
   * Infers tags from project data
   */
  inferTags(project) {
    const tags = [];
    const text = `${project.name} ${project.description} ${project.url}`.toLowerCase();
    
    // Technology detection
    if (text.includes('react')) tags.push('react');
    if (text.includes('python')) tags.push('python');
    if (text.includes('node') || text.includes('javascript')) tags.push('node.js');
    if (text.includes('typescript')) tags.push('typescript');
    if (text.includes('flutter')) tags.push('flutter');
    if (text.includes('discord')) tags.push('discord');
    if (text.includes('telegram')) tags.push('telegram');
    if (text.includes('chrome extension')) tags.push('chrome-extension');
    if (text.includes('vscode') || text.includes('vs code')) tags.push('vscode-extension');
    
    // Feature detection
    if (text.includes('image') || text.includes('picture')) tags.push('image-generation');
    if (text.includes('text') || text.includes('chat')) tags.push('text-generation');
    if (text.includes('audio') || text.includes('voice')) tags.push('audio-generation');
    if (text.includes('free')) tags.push('free');
    if (text.includes('open source') || text.includes('github')) tags.push('open-source');
    if (text.includes('real-time') || text.includes('realtime')) tags.push('real-time');
    if (text.includes('web')) tags.push('web');
    if (text.includes('mobile')) tags.push('mobile');
    if (text.includes('desktop')) tags.push('desktop');
    
    return [...new Set(tags)]; // Remove duplicates
  },
  
  /**
   * Infers tech stack from project data
   */
  inferTechStack(project) {
    const text = `${project.name} ${project.description} ${project.url}`.toLowerCase();
    const techStack = {};
    
    // Frontend
    const frontend = [];
    if (text.includes('react')) frontend.push('React');
    if (text.includes('vue')) frontend.push('Vue.js');
    if (text.includes('angular')) frontend.push('Angular');
    if (text.includes('svelte')) frontend.push('Svelte');
    if (techStack.length > 0) techStack.frontend = frontend;
    
    // Backend 
    const backend = [];
    if (text.includes('node') || text.includes('express')) backend.push('Node.js');
    if (text.includes('python')) backend.push('Python');
    if (text.includes('java')) backend.push('Java');
    if (text.includes('go')) backend.push('Go');
    if (backend.length > 0) techStack.backend = backend;
    
    // AI Models
    const aiModels = ['Pollinations API'];
    if (text.includes('openai') || text.includes('gpt')) aiModels.push('OpenAI GPT');
    if (text.includes('claude')) aiModels.push('Claude');
    if (text.includes('gemini')) aiModels.push('Gemini');
    techStack.aiModels = aiModels;
    
    return techStack;
  },
  
  /**
   * Infers platforms from project data
   */
  inferPlatforms(project) {
    const text = `${project.name} ${project.description} ${project.url}`.toLowerCase();
    const platforms = [];
    
    if (text.includes('web') || project.url.includes('http')) platforms.push('web');
    if (text.includes('mobile') || text.includes('android') || text.includes('ios')) platforms.push('mobile');
    if (text.includes('desktop') || text.includes('electron')) platforms.push('desktop');
    if (text.includes('discord')) platforms.push('discord');
    if (text.includes('telegram')) platforms.push('telegram');
    if (text.includes('chrome extension')) platforms.push('chrome-extension');
    if (text.includes('api')) platforms.push('api');
    
    return platforms.length > 0 ? platforms : ['web']; // Default to web
  },
  
  /**
   * Infers access type from project data
   */
  inferAccessType(project) {
    const text = `${project.name} ${project.description} ${project.url}`.toLowerCase();
    
    if (project.repo || text.includes('open source')) return 'open-source';
    if (text.includes('free')) return 'free';
    if (text.includes('premium') || text.includes('paid')) return 'paid';
    
    return 'free'; // Default
  },
  
  /**
   * Infers Pollinations features used
   */
  inferPollinationsFeatures(project) {
    const text = `${project.name} ${project.description}`.toLowerCase();
    const features = [];
    
    if (text.includes('image')) features.push('image-generation');
    if (text.includes('text') || text.includes('chat')) features.push('text-generation');
    if (text.includes('audio') || text.includes('voice')) features.push('audio-generation');
    if (text.includes('mcp') || text.includes('model context protocol')) features.push('mcp-server');
    if (text.includes('react hook')) features.push('react-hooks');
    
    return features.length > 0 ? features : ['image-generation']; // Default
  },
  
  /**
   * Infers user base from category
   */
  inferUserBase(categoryId) {
    const userBaseMap = {
      vibeCoding: 'developers',
      creative: 'creators', 
      games: 'gamers',
      hackAndBuild: 'developers',
      chat: 'general',
      socialBots: 'general',
      learn: 'students'
    };
    
    return userBaseMap[categoryId] || 'general';
  },
  
  /**
   * Infers difficulty level
   */
  inferDifficulty(project) {
    const text = `${project.name} ${project.description}`.toLowerCase();
    
    if (text.includes('beginner') || text.includes('easy') || text.includes('simple')) return 'beginner';
    if (text.includes('advanced') || text.includes('expert')) return 'advanced';
    if (text.includes('sdk') || text.includes('api') || text.includes('framework')) return 'intermediate';
    
    return 'beginner'; // Default to beginner for accessibility
  }
};

export default projectsData;