import { LLMThemeResponse, processTheme } from "../theme/engine";
import type { ThemeCopy } from "../buildPrompts";

export const AstronautTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#EAF2FF",
      "ids": ["text.primary"]
    },
    "slot_1": {
      "hex": "#C9D7FF",
      "ids": ["text.secondary"]
    },
    "slot_2": {
      "hex": "#A9C4FF",
      "ids": ["text.tertiary"]
    },
    "slot_3": {
      "hex": "#7F92FF",
      "ids": ["text.caption", "input.placeholder"]
    },
    "slot_4": {
      "hex": "#0B1020",
      "ids": ["text.inverse", "surface.page"]
    },
    "slot_5": {
      "hex": "#2DE0FF",
      "ids": ["text.brand", "button.primary.bg", "border.brand"]
    },
    "slot_6": {
      "hex": "#6CF0FF",
      "ids": ["text.highlight"]
    },
    "slot_7": {
      "hex": "#11172A",
      "ids": ["surface.card"]
    },
    "slot_8": {
      "hex": "#0F1624",
      "ids": ["surface.base"]
    },
    "slot_9": {
      "hex": "#0F1A2D",
      "ids": ["input.bg"]
    },
    "slot_10": {
      "hex": "#2A3C83",
      "ids": ["input.border", "border.subtle"]
    },
    "slot_11": {
      "hex": "#15A9C6",
      "ids": ["button.primary.border"]
    },
    "slot_12": {
      "hex": "#2C3550",
      "ids": ["button.secondary.bg"]
    },
    "slot_13": {
      "hex": "#6B5BCA",
      "ids": ["button.secondary.border"]
    },
    "slot_14": {
      "hex": "#1F2A55",
      "ids": ["button.disabled.bg"]
    },
    "slot_15": {
      "hex": "#FFFFFF",
      "ids": ["button.hover.overlay", "button.active.overlay", "border.strong"]
    },
    "slot_16": {
      "hex": "#6AE6FF",
      "ids": ["button.focus.ring", "border.highlight"]
    },
    "slot_17": {
      "hex": "#2D9BFF",
      "ids": ["indicator.image"]
    },
    "slot_18": {
      "hex": "#BDE4FF",
      "ids": ["indicator.text"]
    },
    "slot_19": {
      "hex": "#4EF7FF",
      "ids": ["indicator.audio"]
    },
    "slot_20": {
      "hex": "#2D3A63",
      "ids": ["border.main"]
    },
    "slot_21": {
      "hex": "#4A5B83",
      "ids": ["border.faint"]
    },
    "slot_22": {
      "hex": "#0A1F32",
      "ids": ["shadow.brand.sm"]
    },
    "slot_23": {
      "hex": "#102548",
      "ids": ["shadow.brand.md"]
    },
    "slot_24": {
      "hex": "#1A3A63",
      "ids": ["shadow.brand.lg"]
    },
    "slot_25": {
      "hex": "#0A0F1A",
      "ids": ["shadow.dark.sm"]
    },
    "slot_26": {
      "hex": "#162033",
      "ids": ["shadow.dark.md"]
    },
    "slot_27": {
      "hex": "#1E2940",
      "ids": ["shadow.dark.lg"]
    },
    "slot_28": {
      "hex": "#2A3244",
      "ids": ["shadow.dark.xl"]
    },
    "slot_29": {
      "hex": "#0FF0FF",
      "ids": ["shadow.highlight.sm"]
    },
    "slot_30": {
      "hex": "#58F0FF",
      "ids": ["shadow.highlight.md"]
    },
    "slot_31": {
      "hex": "#7CF0FF",
      "ids": ["logo.main"]
    },
    "slot_32": {
      "hex": "#A0F0FF",
      "ids": ["logo.accent"]
    }
  },
  "borderRadius": {
    "radius.button": "8px",
    "radius.card": "12px",
    "radius.input": "4px",
    "radius.subcard": "8px"
  },
  "fonts": {
    "font.title": "Poppins",
    "font.headline": "Inter",
    "font.body": "Inter"
  }
};

export const AstronautCssVariables = processTheme(AstronautTheme).cssVariables;

// Copy generated with prompt: "astronaut"
export const AstronautCopy: ThemeCopy = {
  "HELLO_PAGE": {
    "heroTitle": {
      "text": "Astronaut AI Touch",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "heroIntro": {
      "text": "We're a tight crew crafting a new AI platform—simple, sleek, built with our community.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "heroTagline": {
      "text": "Need a dependable API or a mission sponsor? You've found your orbit.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "pollenTitle": {
      "text": "Pollen: One Credit",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "pollenDescription": {
      "text": "Pollen is our single, unified credit for all media. The elegant fix for chaotic cosmos.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "getPollenTitle": {
      "text": "Fuel Your Mission",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "getPollenIntro": {
      "text": "Flexible platform. Any dev can buy Pollen; partners get daily grants to launch.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "buyCardTitle": {
      "text": "Simple Space Buy",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "buyCardDescription": {
      "text": "Have an idea? Need an API to power it? Buy Pollen packs and launch fast.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "sponsorshipCardTitle": {
      "text": "Sponsorship Program",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "sponsorshipCardDescription": {
      "text": "We sponsor developers charting next creative wave. Partners receive a daily Pollen grant to launch.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "sponsorshipTiersTitle": {
      "text": "Sponsorship Tiers",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "sponsorshipTiersDescription": {
      "text": "Sponsored partners voyage through a gamified path—progress earns daily grants from Spore to Nectar.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadTitle": {
      "text": "Your Creative Launchpad",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "creativeLaunchpadIntro": {
      "text": "Reach Pollen any way; access our engines; we simplify complexity so you steer.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature1": {
      "text": "Build AI chatbots & agents: deploy memory-rich conversations with our end-to-end framework.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature2": {
      "text": "Create consistent space worlds: characters and assets in a unified style for pro design tools.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature3": {
      "text": "Orchestrate multi-step workflows: chain models to craft autonomous agents that research, summarize, and visualize.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature4": {
      "text": "Craft interactive media (Coming Soon): go beyond static outputs to generate video, audio, and more.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceTitle": {
      "text": "Pollinations Edge",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "differenceIntro": {
      "text": "Why launch with us? Because we're building for you.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature1": {
      "text": "We're accessible: a small team you can chat directly. No support tickets lost in space.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature2": {
      "text": "Flexible: our roadmap is driven by you. We build features our community needs.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature3": {
      "text": "We love beauty: tools should be charming and fun to use.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "roadmapTitle": {
      "text": "Open Creative Horizon",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapIntro": {
      "text": "Our roadmap focuses on enabling every developer's success across the platform.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "roadmapComingSoonLabel": {
      "text": "Coming Soon"
    },
    "roadmapComingSoonTitle": {
      "text": "Secure Front-End",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapComingSoonDescription": {
      "text": "Foundational tech enabling client-side apps to spend Pollen, a key step toward monetization.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "roadmapQ1Label": {
      "text": "Q1 2026"
    },
    "roadmapQ1Title": {
      "text": "In-App Purchase",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapQ1Description": {
      "text": "The economy opens: users buy Pollen inside your app, with a bonus on every purchase.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "roadmapOngoingLabel": {
      "text": "Ongoing"
    },
    "roadmapOngoingTitle": {
      "text": "Beyond",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapOngoingDescription": {
      "text": "We’re moving toward a complete AI app platform, including hosting and discovery.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "ctaTitle": {
      "text": "Ready to Create?",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "ctaDescription": {
      "text": "Skip choosing between power and personality. Build with a platform that offers both.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "getApiKeyButton": {
      "text": "Get Your API Key & Start Building"
    },
    "learnSponsorshipButton": {
      "text": "Learn More About Sponsorship"
    }
  },
  "APPS_PAGE": {
    "title": {
      "text": "Ecosystem",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "subtitle": {
      "text": "Community-built apps, tools, and experiments—Pollinations-powered. Browse, try, ship.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    }
  },
  "DOCS_PAGE": {
    "title": {
      "text": "Integrate",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "intro": {
      "text": "Our API is simple, powerful, and elegant—one endpoint for text, images, and audio.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "apiReference": {
      "text": "Dive into API docs for details. AI agents can use our prompt for seamless integration.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "fullApiDocsButton": {
      "text": "Full API Docs"
    },
    "agentPromptButton": {
      "text": "Agent Prompt"
    },
    "copiedLabel": {
      "text": "Copied!"
    },
    "imageGenerationTitle": {
      "text": "Image Generation",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "pickPromptLabel": {
      "text": "Pick a prompt"
    },
    "optionalParametersLabel": {
      "text": "Optional parameters"
    },
    "generatingLabel": {
      "text": "Generating..."
    },
    "copyUrlButton": {
      "text": "Copy URL"
    },
    "imagePrompts": [
      "a blooming flower in golden hour",
      "bees pollinating wildflowers",
      "organic mycelium network patterns",
      "harmonious forest ecosystem",
      "symbiotic nature interactions",
      "flowing river through biosphere"
    ],
    "textGenerationTitle": {
      "text": "Text Generation",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "modelLabel": {
      "text": "Model"
    },
    "defaultModelLabel": {
      "text": "Default: openai"
    },
    "optionalLabel": {
      "text": "Optional"
    },
    "textPrompts": [
      "explain pollinations.ai",
      "write a poem about nature",
      "describe ecosystem harmony",
      "explain symbiosis"
    ],
    "modelDiscoveryTitle": {
      "text": "Model Discovery",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "selectTypeLabel": {
      "text": "Select a type"
    },
    "imageTypeLabel": {
      "text": "Image"
    },
    "textTypeLabel": {
      "text": "Text"
    },
    "textOpenAITypeLabel": {
      "text": "Text (OpenAI)"
    },
    "loadingModelsLabel": {
      "text": "Loading models..."
    },
    "authenticationTitle": {
      "text": "Authentication",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "keyTypesLabel": {
      "text": "Key Types"
    },
    "publishableLabel": {
      "text": "Publishable"
    },
    "publishableFeature1": {
      "text": "Safe for client-side code"
    },
    "publishableFeature2": {
      "text": "1 pollen/hour per IP+key"
    },
    "publishableFeature3": {
      "text": "Beta: Use secret keys for production"
    },
    "secretLabel": {
      "text": "Secret"
    },
    "secretFeature1": {
      "text": "Server-side only"
    },
    "secretFeature2": {
      "text": "Never expose publicly"
    },
    "secretFeature3": {
      "text": "No rate limits"
    },
    "getYourKeyLabel": {
      "text": "Get Your Key"
    },
    "usageExamplesLabel": {
      "text": "Usage Examples"
    },
    "serverSideDescription": {
      "text": "Server-side (Recommended): Use secret key in Authorization header"
    },
    "clientSideDescription": {
      "text": "Client-side (Public): Use publishable key in query parameter"
    }
  },
  "COMMUNITY_PAGE": {
    "title": {
      "text": "Contribute",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "subtitle": {
      "text": "We're building a platform where developers, creators, and AI enthusiasts collaborate and launch ideas together.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "newsTitle": {
      "text": "What's New",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "newsFilePath": "/NEWS.md",
    "discordTitle": {
      "text": "Discord",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "discordSubtitle": {
      "text": "Join our space community for real-time discussions and support.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "githubTitle": {
      "text": "GitHub",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "githubSubtitle": {
      "text": "Collaborate on open-source projects and contribute code.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "joinDiscordButton": {
      "text": "Join Discord"
    },
    "contributeButton": {
      "text": "Contribute"
    },
    "supportersTitle": {
      "text": "Supporters",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "supportersSubtitle": {
      "text": "Grateful for supporters fueling our platform.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "supportersList": [
      {
        "name": "Perplexity AI",
        "url": "https://www.perplexity.ai/",
        "description": "AI-powered search and conversational answer engine"
      },
      {
        "name": "AWS Activate",
        "url": "https://aws.amazon.com/",
        "description": "GPU Cloud Credits"
      },
      {
        "name": "io.net",
        "url": "https://io.net/",
        "description": "Decentralized GPU network for AI compute"
      },
      {
        "name": "BytePlus",
        "url": "https://www.byteplus.com/",
        "description": "Official ByteDance cloud services and AI solutions"
      },
      {
        "name": "Google Cloud for Startups",
        "url": "https://cloud.google.com/",
        "description": "GPU Cloud Credits"
      },
      {
        "name": "NVIDIA Inception",
        "url": "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        "description": "AI startup support"
      },
      {
        "name": "Azure (MS for Startups)",
        "url": "https://azure.microsoft.com/",
        "description": "OpenAI credits"
      },
      {
        "name": "Cloudflare",
        "url": "https://developers.cloudflare.com/workers-ai/",
        "description": "Put the connectivity cloud to work for you."
      },
      {
        "name": "Scaleway",
        "url": "https://www.scaleway.com/",
        "description": "Europe's empowering cloud provider"
      },
      {
        "name": "Modal",
        "url": "https://modal.com/",
        "description": "High-performance AI infrastructure"
      },
      {
        "name": "NavyAI",
        "url": "https://api.navy/",
        "description": "AI API provider for OpenAI o3 and Gemini models"
      },
      {
        "name": "Nebius",
        "url": "https://nebius.com/",
        "description": "AI-optimized cloud infrastructure with NVIDIA GPU clusters"
      }
    ],
    "supporterLogoPrompt": "Brutalist logo design with bold geometric shapes, heavy lines, stark contrast, raw minimalist aesthetic, transparent background (no background), flat design style. Company:",
    "supporterLogoSeed": 1,
    "supporterLogoModel": "nanobanana"
  },
  "PLAY_PAGE": {
    "createTitle": {
      "text": "Create",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "watchTitle": {
      "text": "Watch",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "createDescription": {
      "text": "Test our API, explore models, and orbit what you create. A fun demo—space to explore.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "feedDescription": {
      "text": "Watch the network's real-time pulse. See what the community is creating now via our APIs.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "toggleWatchOthers": {
      "text": "Watch what others are making",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "toggleBackToPlay": {
      "text": "Back to Play",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "modelsLabel": {
      "text": "Models"
    },
    "imageLabel": {
      "text": "Image"
    },
    "textLabel": {
      "text": "Text"
    },
    "promptLabel": {
      "text": "Prompt"
    },
    "imagePlaceholder": {
      "text": "Describe the image you want..."
    },
    "textPlaceholder": {
      "text": "Enter your question or prompt..."
    },
    "addImagesLabel": {
      "text": "Add Images (Optional)"
    },
    "upToFourLabel": {
      "text": "up to 4"
    },
    "widthLabel": {
      "text": "Width"
    },
    "heightLabel": {
      "text": "Height"
    },
    "seedLabel": {
      "text": "Seed"
    },
    "seedPlaceholder": {
      "text": "0 = random"
    },
    "enhanceLabel": {
      "text": "Enhance"
    },
    "logoLabel": {
      "text": "Logo"
    },
    "generatingText": {
      "text": "Generating..."
    },
    "generateImageButton": {
      "text": "Generate Image"
    },
    "generateTextButton": {
      "text": "Generate Text"
    }
  }
};
