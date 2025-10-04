/**
 * Pollinations.AI Project Metadata Schema
 * 
 * This schema defines the structure for project entries with enhanced metadata
 * to enable advanced filtering, searching, and discovery features.
 */

export const ProjectSchema = {
  // Basic Information (existing fields, enhanced)
  name: {
    type: "string",
    required: true,
    description: "Project name with optional emoji",
    example: "Pollinations AI Chat 💬"
  },
  
  url: {
    type: "string", 
    required: true,
    description: "Primary project URL (website, app store, etc.)",
    example: "https://chat.pollinations.ai"
  },
  
  description: {
    type: "string",
    required: true,
    minLength: 50,
    maxLength: 500,
    description: "Detailed project description",
    example: "An AI-powered chat interface that combines text generation with image creation capabilities..."
  },
  
  author: {
    type: "string",
    required: true,
    description: "Creator username or handle",
    example: "@pollinations"
  },
  
  // Repository Information
  repo: {
    type: "string",
    required: false,
    description: "GitHub repository URL",
    example: "https://github.com/pollinations/pollinations-chat"
  },
  
  stars: {
    type: "number",
    required: false,
    description: "GitHub star count (auto-updated)",
    example: 1205
  },
  
  // Categorization
  category: {
    type: "string",
    required: true,
    enum: ["vibeCoding", "creative", "games", "hackAndBuild", "chat", "socialBots", "learn"],
    description: "Primary project category"
  },
  
  tags: {
    type: "array",
    items: {
      type: "string",
      enum: [
        // Technology Stack
        "react", "vue", "angular", "vanilla-js", "typescript", "python", "node.js", 
        "flutter", "kotlin", "swift", "java", "c#", "go", "rust", "php", "ruby",
        "next.js", "nuxt", "svelte", "express", "fastapi", "django", "flask",
        "electron", "tauri", "pwa", "chrome-extension", "firefox-addon",
        
        // Platforms
        "web", "mobile", "desktop", "android", "ios", "discord", "telegram", 
        "whatsapp", "roblox", "minecraft", "wordpress", "shopify", "figma",
        "vscode", "chrome", "firefox", "edge", "safari",
        
        // AI/ML Features
        "text-generation", "image-generation", "audio-generation", "voice-synthesis",
        "image-analysis", "multimodal", "llm", "stable-diffusion", "gpt", "claude",
        "computer-vision", "nlp", "ml", "ai-assistant", "chatbot",
        
        // Use Cases
        "productivity", "creative-tools", "education", "gaming", "social", 
        "business", "developer-tools", "design", "marketing", "content-creation",
        "automation", "analytics", "monitoring", "deployment", "testing",
        
        // User Experience
        "real-time", "collaborative", "offline-capable", "no-signup", "free",
        "open-source", "beginner-friendly", "advanced", "enterprise",
        
        // Content Types
        "images", "videos", "music", "presentations", "documents", "code",
        "stories", "games", "tutorials", "templates", "apis", "widgets",
        
        // Special Features
        "uncensored", "multi-language", "accessibility", "voice-enabled",
        "drag-and-drop", "batch-processing", "api-integration", "webhook-support"
      ]
    },
    description: "Searchable tags for filtering and discovery",
    example: ["react", "web", "text-generation", "image-generation", "real-time", "free"]
  },
  
  // Technical Details
  techStack: {
    type: "object",
    properties: {
      frontend: {
        type: "array",
        items: { type: "string" },
        description: "Frontend technologies",
        example: ["React", "Material-UI", "TypeScript"]
      },
      backend: {
        type: "array", 
        items: { type: "string" },
        description: "Backend technologies",
        example: ["Node.js", "Express", "CloudFlare Workers"]
      },
      database: {
        type: "array",
        items: { type: "string" },
        description: "Database technologies",
        example: ["MongoDB", "Redis", "PostgreSQL"]
      },
      deployment: {
        type: "array",
        items: { type: "string" },
        description: "Deployment platforms",
        example: ["Vercel", "AWS", "Docker"]
      },
      aiModels: {
        type: "array",
        items: { type: "string" },
        description: "AI models/services used",
        example: ["Pollinations API", "OpenAI GPT-4", "Stable Diffusion"]
      }
    }
  },
  
  // Platform & Access
  platforms: {
    type: "array",
    items: {
      type: "string",
      enum: ["web", "mobile", "desktop", "android", "ios", "discord", "telegram", "whatsapp", "roblox", "wordpress-plugin", "chrome-extension", "vscode-extension", "figma-plugin", "api", "cli"]
    },
    description: "Supported platforms",
    example: ["web", "mobile"]
  },
  
  accessType: {
    type: "string",
    enum: ["free", "freemium", "paid", "open-source", "requires-api-key"],
    description: "Access model",
    example: "free"
  },
  
  // Pollinations Integration
  pollinationsFeatures: {
    type: "array",
    items: {
      type: "string",
      enum: ["image-generation", "text-generation", "audio-generation", "mcp-server", "react-hooks", "api-direct", "webhook-integration"]
    },
    description: "Which Pollinations features are used",
    example: ["image-generation", "text-generation", "react-hooks"]
  },
  
  // User Engagement
  userBase: {
    type: "string",
    enum: ["individuals", "developers", "businesses", "educators", "students", "creators", "gamers", "general"],
    description: "Primary target audience",
    example: "developers"
  },
  
  difficulty: {
    type: "string",
    enum: ["beginner", "intermediate", "advanced", "expert"],
    description: "Technical complexity level",
    example: "beginner"
  },
  
  // Media & Assets
  screenshots: {
    type: "array",
    items: { 
      type: "object",
      properties: {
        url: { type: "string" },
        alt: { type: "string" },
        caption: { type: "string" }
      }
    },
    description: "Project screenshots",
    maxItems: 5
  },
  
  logo: {
    type: "string",
    description: "Project logo URL",
    example: "https://example.com/logo.png"
  },
  
  video: {
    type: "string", 
    description: "Demo video URL",
    example: "https://youtube.com/watch?v=demo"
  },
  
  // Metadata
  submissionDate: {
    type: "string",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    description: "Submission date (YYYY-MM-DD)",
    example: "2024-10-02"
  },
  
  lastUpdated: {
    type: "string",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$", 
    description: "Last update date (YYYY-MM-DD)",
    example: "2024-10-02"
  },
  
  language: {
    type: "string",
    description: "Primary language/locale",
    example: "en-US"
  },
  
  // Status & Visibility
  status: {
    type: "string",
    enum: ["active", "maintenance", "deprecated", "beta", "alpha"],
    default: "active",
    description: "Project status"
  },
  
  featured: {
    type: "boolean",
    default: false,
    description: "Whether to feature prominently"
  },
  
  hidden: {
    type: "boolean", 
    default: false,
    description: "Hide from public listings"
  },
  
  order: {
    type: "number",
    default: 3,
    description: "Display priority (1=highest, 5=lowest)"
  },
  
  // Computed Fields (auto-generated)
  isNew: {
    type: "boolean",
    computed: true,
    description: "Auto-computed based on submissionDate"
  },
  
  searchText: {
    type: "string", 
    computed: true,
    description: "Combined searchable text for full-text search"
  },
  
  // Validation & Quality
  verified: {
    type: "boolean",
    default: false,
    description: "Manually verified by team"
  },
  
  qualityScore: {
    type: "number",
    min: 0,
    max: 100,
    description: "Auto-computed quality score based on completeness, engagement, etc."
  }
};

/**
 * Filter Configuration Schema
 * Defines available filters for the project discovery interface
 */
export const FilterSchema = {
  categories: {
    type: "multi-select",
    options: [
      { value: "vibeCoding", label: "Vibe Coding ✨", description: "No-code builders & playgrounds" },
      { value: "creative", label: "Creative 🎨", description: "Image, video, music generation" },
      { value: "games", label: "Games 🎲", description: "AI-powered gaming experiences" },
      { value: "hackAndBuild", label: "Hack & Build 🛠️", description: "SDKs, tools, integrations" },
      { value: "chat", label: "Chat 💬", description: "Conversational interfaces" },
      { value: "socialBots", label: "Social Bots 🤖", description: "Platform bots & NPCs" },
      { value: "learn", label: "Learn 📚", description: "Educational resources" }
    ]
  },
  
  techStack: {
    type: "multi-select",
    options: [
      { value: "react", label: "React", icon: "⚛️" },
      { value: "vue", label: "Vue.js", icon: "💚" },
      { value: "python", label: "Python", icon: "🐍" },
      { value: "node.js", label: "Node.js", icon: "💚" },
      { value: "typescript", label: "TypeScript", icon: "🔷" },
      { value: "flutter", label: "Flutter", icon: "💙" },
      { value: "next.js", label: "Next.js", icon: "⚫" },
      { value: "electron", label: "Electron", icon: "⚡" }
    ]
  },
  
  platforms: {
    type: "multi-select",
    options: [
      { value: "web", label: "Web", icon: "🌐" },
      { value: "mobile", label: "Mobile", icon: "📱" },
      { value: "desktop", label: "Desktop", icon: "🖥️" },
      { value: "discord", label: "Discord", icon: "💬" },
      { value: "telegram", label: "Telegram", icon: "✈️" },
      { value: "chrome-extension", label: "Chrome Extension", icon: "🔌" },
      { value: "vscode-extension", label: "VS Code Extension", icon: "💙" }
    ]
  },
  
  pollinationsFeatures: {
    type: "multi-select", 
    options: [
      { value: "image-generation", label: "Image Generation", icon: "🎨" },
      { value: "text-generation", label: "Text Generation", icon: "📝" },
      { value: "audio-generation", label: "Audio Generation", icon: "🎵" },
      { value: "mcp-server", label: "MCP Server", icon: "🔗" },
      { value: "react-hooks", label: "React Hooks", icon: "⚛️" }
    ]
  },
  
  accessType: {
    type: "single-select",
    options: [
      { value: "free", label: "Free", icon: "🆓" },
      { value: "open-source", label: "Open Source", icon: "📖" },
      { value: "freemium", label: "Freemium", icon: "💎" },
      { value: "paid", label: "Paid", icon: "💳" }
    ]
  },
  
  difficulty: {
    type: "single-select",
    options: [
      { value: "beginner", label: "Beginner", icon: "🌱" },
      { value: "intermediate", label: "Intermediate", icon: "🌿" },
      { value: "advanced", label: "Advanced", icon: "🌳" },
      { value: "expert", label: "Expert", icon: "🏔️" }
    ]
  },
  
  sortBy: {
    type: "single-select",
    options: [
      { value: "relevance", label: "Relevance" },
      { value: "stars", label: "GitHub Stars" },
      { value: "newest", label: "Newest" },
      { value: "updated", label: "Recently Updated" },
      { value: "name", label: "Name (A-Z)" },
      { value: "featured", label: "Featured First" }
    ]
  }
};

/**
 * Validation utilities for the project schema
 */
export const ProjectValidation = {
  /**
   * Validates a project object against the schema
   */
  validate(project) {
    const errors = [];
    
    // Required fields
    if (!project.name) errors.push("name is required");
    if (!project.url) errors.push("url is required");
    if (!project.description) errors.push("description is required");
    if (!project.author) errors.push("author is required");
    if (!project.category) errors.push("category is required");
    
    // Field validation
    if (project.description && project.description.length < 50) {
      errors.push("description must be at least 50 characters");
    }
    
    if (project.description && project.description.length > 500) {
      errors.push("description must be less than 500 characters");
    }
    
    return errors;
  },
  
  /**
   * Computes auto-generated fields
   */
  computeFields(project) {
    const computed = { ...project };
    
    // Compute isNew
    if (project.submissionDate) {
      const submissionDate = new Date(project.submissionDate);
      const now = new Date();
      const diffDays = Math.ceil((now - submissionDate) / (1000 * 60 * 60 * 24));
      computed.isNew = diffDays <= 15;
    }
    
    // Compute searchText
    computed.searchText = [
      project.name,
      project.description,
      project.author,
      ...(project.tags || []),
      ...(project.platforms || []),
      project.category
    ].filter(Boolean).join(" ").toLowerCase();
    
    // Compute quality score (basic implementation)
    let qualityScore = 50; // Base score
    
    if (project.repo) qualityScore += 10;
    if (project.screenshots?.length > 0) qualityScore += 10;
    if (project.description?.length > 100) qualityScore += 5;
    if (project.tags?.length >= 3) qualityScore += 10;
    if (project.verified) qualityScore += 15;
    if (project.stars > 100) qualityScore += 10;
    
    computed.qualityScore = Math.min(qualityScore, 100);
    
    return computed;
  }
};

export default ProjectSchema;