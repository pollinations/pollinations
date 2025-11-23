import { LLMThemeResponse, processTheme } from "../theme/engine";
import type { ThemeCopy } from "../buildPrompts";

export const SymbioticNatureInteractionsTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#263238",
      "ids": [
        "text.primary",
        "indicator.text",
        "border.strong"
      ]
    },
    "slot_1": {
      "hex": "#2E7D32",
      "ids": [
        "text.secondary",
        "indicator.image",
        "border.highlight",
        "shadow.highlight.sm"
      ]
    },
    "slot_2": {
      "hex": "#8A6D3B",
      "ids": [
        "text.tertiary",
        "text.caption"
      ]
    },
    "slot_3": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "surface.card",
        "input.bg"
      ]
    },
    "slot_4": {
      "hex": "#1B5E20",
      "ids": [
        "text.brand",
        "border.brand",
        "shadow.highlight.md"
      ]
    },
    "slot_5": {
      "hex": "#42A5F5",
      "ids": [
        "text.highlight",
        "button.primary.bg",
        "button.focus.ring",
        "logo.main"
      ]
    },
    "slot_6": {
      "hex": "#F8F6F0",
      "ids": [
        "surface.page"
      ]
    },
    "slot_7": {
      "hex": "#F2F6F2",
      "ids": [
        "surface.base"
      ]
    },
    "slot_8": {
      "hex": "#D1DDD0",
      "ids": [
        "input.border"
      ]
    },
    "slot_9": {
      "hex": "#A8B4A8",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_10": {
      "hex": "#2A7BC6",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_11": {
      "hex": "#8BC34A",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_12": {
      "hex": "#6A9C3F",
      "ids": [
        "button.secondary.border"
      ]
    },
    "slot_13": {
      "hex": "#F3F5F7",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_14": {
      "hex": "#E0F2FF",
      "ids": [
        "button.hover.overlay"
      ]
    },
    "slot_15": {
      "hex": "#D0E6FF",
      "ids": [
        "button.active.overlay"
      ]
    },
    "slot_16": {
      "hex": "#FF8A65",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_17": {
      "hex": "#C7D4C9",
      "ids": [
        "border.main"
      ]
    },
    "slot_18": {
      "hex": "#DDE6E0",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_19": {
      "hex": "#F5F5F5",
      "ids": [
        "border.faint"
      ]
    },
    "slot_20": {
      "hex": "#000000",
      "ids": [
        "shadow.brand.sm",
        "shadow.brand.md",
        "shadow.brand.lg",
        "shadow.dark.sm",
        "shadow.dark.md",
        "shadow.dark.lg",
        "shadow.dark.xl"
      ]
    },
    "slot_21": {
      "hex": "#26A69A",
      "ids": [
        "logo.accent"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "14px",
    "radius.card": "16px",
    "radius.input": "12px",
    "radius.subcard": "12px"
  },
  "fonts": {
    "font.title": "Quicksand",
    "font.headline": "Lato",
    "font.body": "Roboto"
  }
};

export const SymbioticNatureInteractionsCssVariables = processTheme(SymbioticNatureInteractionsTheme).cssVariables;

// Copy generated with prompt: "symbiotic nature interactions"
export const SymbioticNatureInteractionsCopy: ThemeCopy = {
  "HELLO_PAGE": {
    "heroTitle": {
      "text": "Symbiotic AI",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "heroIntro": {
      "text": "Small, passionate team growing an AI platform that's simple, beautiful, and co-created with our community.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "heroTagline": {
      "text": "Need a dependable API or a sponsor for your idea? Discover your habitat in our symbiotic network.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "pollenTitle": {
      "text": "Pollen: Unified Credit",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "pollenDescription": {
      "text": "Pollen is a single, unified credit for all generative media—a simple, fair, predictable path through a chaotic landscape, welcoming every kind of maker.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "getPollenTitle": {
      "text": "Pollen your way",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "getPollenIntro": {
      "text": "Our platform grows with you. Developers can buy Pollen, while partners receive daily grants to seed their joint journey.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "buyCardTitle": {
      "text": "Simple, fast access",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "buyCardDescription": {
      "text": "Have an idea and need an API to empower it? Buy Pollen packs and build in minutes. No strings attached.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "sponsorshipCardTitle": {
      "text": "Sponsorship for growth",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "sponsorshipCardDescription": {
      "text": "We sponsor developers shaping the next wave of creative apps. Partners receive a daily Pollen grant to de-risk development and launch projects.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "sponsorshipTiersTitle": {
      "text": "Sponsorship tiers",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "sponsorshipTiersDescription": {
      "text": "Sponsored partners grow through a gamified path from Spore to Seed to Flower to Nectar.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadTitle": {
      "text": "Creative launchpad",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "creativeLaunchpadIntro": {
      "text": "No matter how you obtain Pollen, you gain access to our high-level creative engines. We simplify complexity so you focus on your vision.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature1": {
      "text": "Build conversational bots and agents with memory using our end-to-end framework.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature2": {
      "text": "Cultivate coherent visual worlds: shape characters and assets in a unified style for professional design tools.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature3": {
      "text": "Orchestrate multi-step symbiotic workflows: chain models to craft autonomous agents that research, summarize, and visualize.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "creativeLaunchpadFeature4": {
      "text": "Craft interactive media: go beyond static outputs with tools to generate video, audio, and more.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceTitle": {
      "text": "Pollinations difference",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "differenceIntro": {
      "text": "Why grow with us? We cultivate for you.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature1": {
      "text": "We're accessible: a small team you can talk to directly. No tickets lost in the void.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature2": {
      "text": "We bend with you: our roadmap grows from your needs.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "differenceFeature3": {
      "text": "We cherish beauty: tools should be charming and joyful to use.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "roadmapTitle": {
      "text": "Open creative economy",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapIntro": {
      "text": "Our roadmap centers on enabling every developer's success on our platform.",
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
      "text": "Secure front-end spending",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapComingSoonDescription": {
      "text": "Foundational tech letting client apps spend Pollen, a key step toward monetization.",
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
      "text": "In-app purchase",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "roadmapQ1Description": {
      "text": "Economy opens: users buy Pollen inside your app, you gain a bonus with every purchase. This is the aim for our sponsored partners.",
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
      "text": "Moving toward a complete AI app ecosystem, with hosting and discovery.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "ctaTitle": {
      "text": "Ready to create?",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:3"
      ]
    },
    "ctaDescription": {
      "text": "Stop balancing power and personality; grow on a platform that blends both.",
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
      "text": "Our API is simple, powerful, elegant—one endpoint for text, images, and audio, where your vision takes flight.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "apiReference": {
      "text": "Dive into our API docs for details. AI agents can use our optimized prompts for seamless integration.",
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
      "text": "Image generation",
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
      "text": "Text generation",
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
      "text": "Model discovery",
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
      "text": "We build a platform where creators and AI enthusiasts collaborate.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "newsTitle": {
      "text": "What's new",
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
      "text": "Join our community for real-time discussions and support.",
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
      "text": "Collaborate on open-source projects and grow together.",
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
      "text": "Grateful for supporters nurturing our symbiotic platform.",
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
      "text": "Test our API, explore models, and create. A playful demo playground, not the main product—a space to explore and experiment.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "feedDescription": {
      "text": "Watch the network's pulse in real time. See what the community is creating now through our APIs.",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "toggleWatchOthers": {
      "text": "See others' creations",
      "transforms": [
        "responsive",
        "translateTo",
        "brevity:25"
      ]
    },
    "toggleBackToPlay": {
      "text": "Return to play",
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
