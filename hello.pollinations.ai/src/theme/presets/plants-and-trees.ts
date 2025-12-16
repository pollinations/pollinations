import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const PlantsAndTreesTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#e8f5e9",
      "ids": [
        "text.primary",
        "input.text"
      ]
    },
    "slot_1": {
      "hex": "#a5d6a7",
      "ids": [
        "text.secondary",
        "indicator.text"
      ]
    },
    "slot_2": {
      "hex": "#1b3026",
      "ids": [
        "input.bg",
        "button.secondary.bg",
        "border.subtle"
      ]
    },
    "slot_3": {
      "hex": "#2e4d3e",
      "ids": [
        "input.border",
        "button.secondary.border",
        "border.main"
      ]
    },
    "slot_4": {
      "hex": "#4c6b5d",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_5": {
      "hex": "#2e7d32",
      "ids": [
        "button.primary.bg",
        "button.active.overlay"
      ]
    },
    "slot_6": {
      "hex": "#43a047",
      "ids": [
        "button.primary.border",
        "background.element1"
      ]
    },
    "slot_7": {
      "hex": "#1b2621",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_8": {
      "hex": "#66bb6a",
      "ids": [
        "button.focus.ring",
        "indicator.image",
        "border.highlight"
      ]
    },
    "slot_9": {
      "hex": "#8d6e63",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_10": {
      "hex": "#558b2f",
      "ids": [
        "indicator.video"
      ]
    },
    "slot_11": {
      "hex": "#388e3c",
      "ids": [
        "border.strong"
      ]
    },
    "slot_12": {
      "hex": "#607d8b",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#003300",
      "ids": [
        "shadow.brand.lg"
      ]
    },
    "slot_14": {
      "hex": "#000000",
      "ids": [
        "shadow.dark.sm",
        "shadow.dark.lg",
        "shadow.dark.xl"
      ]
    },
    "slot_15": {
      "hex": "#050a08",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_16": {
      "hex": "#33691e",
      "ids": [
        "shadow.highlight.sm",
        "shadow.highlight.md"
      ]
    },
    "slot_17": {
      "hex": "#81c784",
      "ids": [
        "logo.main"
      ]
    },
    "slot_18": {
      "hex": "#cddc39",
      "ids": [
        "logo.accent",
        "background.particle"
      ]
    },
    "slot_19": {
      "hex": "#795548",
      "ids": [
        "background.element2"
      ]
    },
    "slot_20": {
      "hex": "#546e7a",
      "ids": [
        "text.caption"
      ]
    },
    "slot_21": {
      "hex": "#1b5e20",
      "ids": [
        "text.inverse",
        "shadow.brand.sm",
        "shadow.brand.md"
      ]
    },
    "slot_22": {
      "hex": "#4caf50",
      "ids": [
        "text.brand",
        "button.hover.overlay",
        "border.brand"
      ]
    },
    "slot_23": {
      "hex": "#b9f6ca",
      "ids": [
        "text.highlight"
      ]
    },
    "slot_24": {
      "hex": "#0a1410",
      "ids": [
        "surface.page",
        "background.base"
      ]
    },
    "slot_25": {
      "hex": "#13261e",
      "ids": [
        "surface.card",
        "border.faint"
      ]
    },
    "slot_26": {
      "hex": "#0f1f1a",
      "ids": [
        "surface.base"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "8px",
    "radius.card": "16px"
  },
  "fonts": {
    "font.title": "Bitter",
    "font.headline": "DM Sans",
    "font.body": "Nunito Sans"
  },
  "opacity": {
    "opacity.card": "0.92",
    "opacity.overlay": "0.88",
    "opacity.glass": "0.7"
  }
};

export const PlantsAndTreesCssVariables = processTheme(PlantsAndTreesTheme).cssVariables;

// Copy from: "plants and trees"
export const PlantsAndTreesCopy = {
  "APPS_PAGE.title.text": "Ecosystem",
  "APPS_PAGE.subtitle.text": "Explore our lush ecosystem of Pollinations-powered tools.",
  "COMMUNITY_PAGE.title.text": "Contribute",
  "COMMUNITY_PAGE.subtitle.text": "A fertile garden where creators and developers cultivate ideas and bloom together.",
  "COMMUNITY_PAGE.newsTitle.text": "What's New",
  "COMMUNITY_PAGE.newsFilePath": "/NEWS.md",
  "COMMUNITY_PAGE.discordTitle.text": "Discord",
  "COMMUNITY_PAGE.discordSubtitle.text": "Gather in our sunlit grove for support.",
  "COMMUNITY_PAGE.githubTitle.text": "GitHub",
  "COMMUNITY_PAGE.githubSubtitle.text": "Branch out and contribute to open-source code.",
  "COMMUNITY_PAGE.joinDiscordButton.text": "Join Discord",
  "COMMUNITY_PAGE.contributeButton.text": "Contribute",
  "COMMUNITY_PAGE.supportersTitle.text": "Supporters",
  "COMMUNITY_PAGE.supportersSubtitle.text": "Grateful to those who nourish our platform's soil.",
  "COMMUNITY_PAGE.supportersList.0.name": "Perplexity AI",
  "COMMUNITY_PAGE.supportersList.0.url": "https://www.perplexity.ai/",
  "COMMUNITY_PAGE.supportersList.0.description": "AI-powered search and conversational answer engine",
  "COMMUNITY_PAGE.supportersList.1.name": "AWS Activate",
  "COMMUNITY_PAGE.supportersList.1.url": "https://aws.amazon.com/",
  "COMMUNITY_PAGE.supportersList.1.description": "GPU Cloud Credits",
  "COMMUNITY_PAGE.supportersList.2.name": "io.net",
  "COMMUNITY_PAGE.supportersList.2.url": "https://io.net/",
  "COMMUNITY_PAGE.supportersList.2.description": "Decentralized GPU network for AI compute",
  "COMMUNITY_PAGE.supportersList.3.name": "BytePlus",
  "COMMUNITY_PAGE.supportersList.3.url": "https://www.byteplus.com/",
  "COMMUNITY_PAGE.supportersList.3.description": "Official ByteDance cloud services and AI solutions",
  "COMMUNITY_PAGE.supportersList.4.name": "Google Cloud for Startups",
  "COMMUNITY_PAGE.supportersList.4.url": "https://cloud.google.com/",
  "COMMUNITY_PAGE.supportersList.4.description": "GPU Cloud Credits",
  "COMMUNITY_PAGE.supportersList.5.name": "NVIDIA Inception",
  "COMMUNITY_PAGE.supportersList.5.url": "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
  "COMMUNITY_PAGE.supportersList.5.description": "AI startup support",
  "COMMUNITY_PAGE.supportersList.6.name": "Azure (MS for Startups)",
  "COMMUNITY_PAGE.supportersList.6.url": "https://azure.microsoft.com/",
  "COMMUNITY_PAGE.supportersList.6.description": "OpenAI credits",
  "COMMUNITY_PAGE.supportersList.7.name": "Cloudflare",
  "COMMUNITY_PAGE.supportersList.7.url": "https://developers.cloudflare.com/workers-ai/",
  "COMMUNITY_PAGE.supportersList.7.description": "Put the connectivity cloud to work for you.",
  "COMMUNITY_PAGE.supportersList.8.name": "Scaleway",
  "COMMUNITY_PAGE.supportersList.8.url": "https://www.scaleway.com/",
  "COMMUNITY_PAGE.supportersList.8.description": "Europe's empowering cloud provider",
  "COMMUNITY_PAGE.supportersList.9.name": "Modal",
  "COMMUNITY_PAGE.supportersList.9.url": "https://modal.com/",
  "COMMUNITY_PAGE.supportersList.9.description": "High-performance AI infrastructure",
  "COMMUNITY_PAGE.supportersList.10.name": "NavyAI",
  "COMMUNITY_PAGE.supportersList.10.url": "https://api.navy/",
  "COMMUNITY_PAGE.supportersList.10.description": "AI API provider for OpenAI o3 and Gemini models",
  "COMMUNITY_PAGE.supportersList.11.name": "Nebius",
  "COMMUNITY_PAGE.supportersList.11.url": "https://nebius.com/",
  "COMMUNITY_PAGE.supportersList.11.description": "AI-optimized cloud infrastructure with NVIDIA GPU clusters",
  "COMMUNITY_PAGE.supporterLogoPrompt": "Brutalist logo design with bold geometric shapes, heavy lines, stark contrast, raw minimalist aesthetic, transparent background (no background), flat design style. Company:",
  "COMMUNITY_PAGE.supporterLogoModel": "nanobanana",
  "DOCS_PAGE.title.text": "Integrate",
  "DOCS_PAGE.intro.text": "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
  "DOCS_PAGE.apiReference.text": "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
  "DOCS_PAGE.fullApiDocsButton.text": "Full API Docs",
  "DOCS_PAGE.agentPromptButton.text": "Agent Prompt",
  "DOCS_PAGE.copiedLabel.text": "Copied!",
  "DOCS_PAGE.imageGenerationTitle.text": "Image Generation",
  "DOCS_PAGE.pickPromptLabel.text": "Pick a prompt",
  "DOCS_PAGE.optionalParametersLabel.text": "Optional parameters",
  "DOCS_PAGE.generatingLabel.text": "Generating...",
  "DOCS_PAGE.copyUrlButton.text": "Copy URL",
  "DOCS_PAGE.imagePrompts.0": "a blooming flower in golden hour",
  "DOCS_PAGE.imagePrompts.1": "bees pollinating wildflowers",
  "DOCS_PAGE.imagePrompts.2": "organic mycelium network patterns",
  "DOCS_PAGE.imagePrompts.3": "harmonious forest ecosystem",
  "DOCS_PAGE.imagePrompts.4": "symbiotic nature interactions",
  "DOCS_PAGE.imagePrompts.5": "flowing river through biosphere",
  "DOCS_PAGE.textGenerationTitle.text": "Text Generation",
  "DOCS_PAGE.modelLabel.text": "Model",
  "DOCS_PAGE.defaultModelLabel.text": "Default: openai",
  "DOCS_PAGE.optionalLabel.text": "Optional",
  "DOCS_PAGE.textPrompts.0": "explain pollinations.ai",
  "DOCS_PAGE.textPrompts.1": "write a poem about nature",
  "DOCS_PAGE.textPrompts.2": "describe ecosystem harmony",
  "DOCS_PAGE.textPrompts.3": "explain symbiosis",
  "DOCS_PAGE.modelDiscoveryTitle.text": "Model Discovery",
  "DOCS_PAGE.selectTypeLabel.text": "Select a type",
  "DOCS_PAGE.imageTypeLabel.text": "Image",
  "DOCS_PAGE.textTypeLabel.text": "Text",
  "DOCS_PAGE.textOpenAITypeLabel.text": "Text (OpenAI)",
  "DOCS_PAGE.loadingModelsLabel.text": "Loading models...",
  "DOCS_PAGE.authenticationTitle.text": "Authentication",
  "DOCS_PAGE.keyTypesLabel.text": "Key Types",
  "DOCS_PAGE.publishableLabel.text": "Publishable",
  "DOCS_PAGE.publishableFeature1.text": "Safe for client-side code",
  "DOCS_PAGE.publishableFeature2.text": "1 pollen/hour per IP+key",
  "DOCS_PAGE.publishableFeature3.text": "Beta: Use secret keys for production",
  "DOCS_PAGE.secretLabel.text": "Secret",
  "DOCS_PAGE.secretFeature1.text": "Server-side only",
  "DOCS_PAGE.secretFeature2.text": "Never expose publicly",
  "DOCS_PAGE.secretFeature3.text": "No rate limits",
  "DOCS_PAGE.getYourKeyLabel.text": "Get Your Key",
  "DOCS_PAGE.usageExamplesLabel.text": "Usage Examples",
  "DOCS_PAGE.serverSideDescription.text": "Server-side (Recommended): Use secret key in Authorization header",
  "DOCS_PAGE.clientSideDescription.text": "Client-side (Public): Use publishable key in query parameter",
  "HELLO_PAGE.heroTitle.text": "Fertile ground for creative developers.",
  "HELLO_PAGE.heroIntro.text": "Soft, simple tools for people who want to build with heart — whether you're exploring ideas, crafting worlds, or shipping serious apps.",
  "HELLO_PAGE.heroTagline.text": "Open-source roots. Community at the center.",
  "HELLO_PAGE.whatIsTitle.text": "What Pollinations Is",
  "HELLO_PAGE.whatIsDescription.text": "Pollinations is a credit-based AI platform for developers who want to move quickly, stay playful, and still have something they can rely on in production. We offer a unified multimodal API for images, text, audio — with real-time and video on the way. Pollen, a simple credit system that makes usage predictable and transparent. A developer journey that feels welcoming instead of corporate. A community that's already building tools, games, and experiments with us every day.",
  "HELLO_PAGE.whatIsTagline.text": "Pollen exists so developers can experiment freely, without getting lost in pricing tables or infrastructure details.",
  "HELLO_PAGE.pollenTitle.text": "Pollen — One Simple Credit for Everything",
  "HELLO_PAGE.pollenDescription.text": "Pollen is the single credit you use across Pollinations for all generative media. One unit for many models, so you can switch, mix, and iterate without mental overhead.",
  "HELLO_PAGE.getPollenTitle.text": "How to Get Pollen",
  "HELLO_PAGE.getPollenIntro.text": "Two main paths:",
  "HELLO_PAGE.buyCardTitle.text": "Buy Pollen",
  "HELLO_PAGE.buyCardDescription.text": "Add Pollen to your wallet and build. Straightforward packs, no subscriptions, no locked-in tiers.",
  "HELLO_PAGE.earnCardTitle.text": "Earn Pollen",
  "HELLO_PAGE.earnCardDescription.text": "For developers growing inside the Pollinations ecosystem. Earn through daily sponsorship grants as you progress through tiers, or complete one-off quests and bounties.",
  "HELLO_PAGE.tiersSubtitle.text": "Sponsorship Tiers",
  "HELLO_PAGE.tiersDescription.text": "Grow your daily Pollen grant as you build and ship:",
  "HELLO_PAGE.tierSporeTitle.text": "Spore — You join.",
  "HELLO_PAGE.tierSporeDescription.text": "Small daily Pollen to try the platform.",
  "HELLO_PAGE.tierSeedTitle.text": "Seed — You verify as a developer.",
  "HELLO_PAGE.tierSeedDescription.text": "Higher daily Pollen. Based on light signals like GitHub, Discord, and a short intro.",
  "HELLO_PAGE.tierFlowerTitle.text": "Flower — You publish a working app.",
  "HELLO_PAGE.tierFlowerDescription.text": "Bigger daily Pollen grants. Your app is registered and reviewed in the dashboard.",
  "HELLO_PAGE.tierNectarTitle.text": "Nectar — Your app shows real traction.",
  "HELLO_PAGE.tierNectarDescription.text": "The highest grants. Tuned to apps that create value and activity in the ecosystem.",
  "HELLO_PAGE.questsSubtitle.text": "Quests & One-Off Rewards",
  "HELLO_PAGE.questsDescription.text": "Complete community quests, bounties, and contributions to earn extra Pollen. Fix issues, share knowledge, contribute to projects, or take part in creative challenges.",
  "HELLO_PAGE.questsStatus.text": "Coming soon",
  "HELLO_PAGE.buildTitle.text": "What You Can Build",
  "HELLO_PAGE.buildIntro.text": "Generative tools without friction:",
  "HELLO_PAGE.buildFeature1.text": "Chatbots and agents with memory",
  "HELLO_PAGE.buildFeature2.text": "Visual worlds with consistent characters and assets",
  "HELLO_PAGE.buildFeature3.text": "Multi-step workflows for research, summarization, and creation",
  "HELLO_PAGE.buildFeature4.text": "Interactive media and new modalities (video, audio, and more — coming soon)",
  "HELLO_PAGE.whyChooseTitle.text": "Why Developers Choose Pollinations",
  "HELLO_PAGE.whyChooseIntro.text": "You get a platform that cares about aesthetics and ergonomics as much as raw capability.",
  "HELLO_PAGE.whyChooseFeature1.text": "Beautiful Dev Experience — clean APIs, thoughtful defaults, and friendly docs.",
  "HELLO_PAGE.whyChooseFeature2.text": "Unified API — work with multiple models and modalities through one place.",
  "HELLO_PAGE.whyChooseFeature3.text": "Simple Credits — Pollen makes usage and cost easier to reason about.",
  "HELLO_PAGE.whyChooseFeature4.text": "Community-First — roadmap influenced directly by people building with us.",
  "HELLO_PAGE.whyChooseFeature5.text": "Open Source — we build in the open and invite you to look under the hood.",
  "HELLO_PAGE.communityTitle.text": "Built With Community",
  "HELLO_PAGE.communityDescription.text": "Pollinations is shaped by students, indie devs, small teams, and studios experimenting with new forms of AI-native creativity. Active community channels, open discussions on features and models, bounties and quests coming soon.",
  "HELLO_PAGE.roadmapTitle.text": "Roadmap (Preview)",
  "HELLO_PAGE.roadmapIntro.text": "We're in beta, and we share where we're heading:",
  "HELLO_PAGE.roadmapItem1Title.text": "Secure Front-End Spending",
  "HELLO_PAGE.roadmapItem1Description.text": "Let client-side apps use Pollen safely.",
  "HELLO_PAGE.roadmapItem2Title.text": "In-App Pollen Purchases",
  "HELLO_PAGE.roadmapItem2Description.text": "Users buy Pollen inside your app; you earn a share. (Q1 2026)",
  "HELLO_PAGE.roadmapItem3Title.text": "App Hosting & Discovery",
  "HELLO_PAGE.roadmapItem3Description.text": "Ship your app and make it easy to find.",
  "HELLO_PAGE.roadmapItem4Title.text": "Expanded Modalities & Models",
  "HELLO_PAGE.roadmapItem4Description.text": "Real-time experiences, video generation, and a growing catalog—more choices, same simple Pollen system.",
  "HELLO_PAGE.ctaTitle.text": "Ready to Create?",
  "HELLO_PAGE.ctaDescription.text": "Start building with tools that feel good to use.",
  "HELLO_PAGE.getApiKeyButton.text": "Get Your API Key",
  "HELLO_PAGE.startCreatingButton.text": "Start Creating",
  "HELLO_PAGE.joinCommunityButton.text": "Join the Community",
  "HELLO_PAGE.viewPricingButton.text": "View Pricing",
  "HELLO_PAGE.exploreTiersButton.text": "Learn More About Tiers",
  "HELLO_PAGE.seeAppsButton.text": "See Featured Apps",
  "PLAY_PAGE.createTitle.text": "Create",
  "PLAY_PAGE.watchTitle.text": "Watch",
  "PLAY_PAGE.createDescription.text": "Test our API, play with different models, and see what you can create. This is a fun demo playground—not our main product, just a place to explore and experiment.",
  "PLAY_PAGE.feedDescription.text": "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
  "PLAY_PAGE.toggleWatchOthers.text": "Watch what others are making",
  "PLAY_PAGE.toggleBackToPlay.text": "Back to Play",
  "PLAY_PAGE.modelsLabel.text": "Models",
  "PLAY_PAGE.imageLabel.text": "Image",
  "PLAY_PAGE.textLabel.text": "Text",
  "PLAY_PAGE.promptLabel.text": "Prompt",
  "PLAY_PAGE.imagePlaceholder.text": "Describe the image you want...",
  "PLAY_PAGE.textPlaceholder.text": "Enter your question or prompt...",
  "PLAY_PAGE.addImagesLabel.text": "Add Images (Optional)",
  "PLAY_PAGE.upToFourLabel.text": "up to 4",
  "PLAY_PAGE.widthLabel.text": "Width",
  "PLAY_PAGE.heightLabel.text": "Height",
  "PLAY_PAGE.seedLabel.text": "Seed",
  "PLAY_PAGE.seedPlaceholder.text": "0 = random",
  "PLAY_PAGE.enhanceLabel.text": "Enhance",
  "PLAY_PAGE.logoLabel.text": "Logo",
  "PLAY_PAGE.generatingText.text": "Generating...",
  "PLAY_PAGE.generateImageButton.text": "Generate Image",
  "PLAY_PAGE.generateTextButton.text": "Generate Text",
  "SOCIAL_LINKS.discord.label": "Discord",
  "SOCIAL_LINKS.discord.url": "https://discord.gg/k9F7SyTgqn",
  "SOCIAL_LINKS.discord.width": "32px",
  "SOCIAL_LINKS.discord.height": "32px",
  "SOCIAL_LINKS.github.label": "GitHub",
  "SOCIAL_LINKS.github.url": "https://www.github.com/pollinations/pollinations",
  "SOCIAL_LINKS.github.width": "25px",
  "SOCIAL_LINKS.github.height": "25px",
  "SOCIAL_LINKS.linkedin.label": "LinkedIn",
  "SOCIAL_LINKS.linkedin.url": "https://www.linkedin.com/company/pollinations-ai",
  "SOCIAL_LINKS.linkedin.width": "22px",
  "SOCIAL_LINKS.linkedin.height": "22px",
  "SOCIAL_LINKS.instagram.label": "Instagram",
  "SOCIAL_LINKS.instagram.url": "https://instagram.com/pollinations_ai",
  "SOCIAL_LINKS.instagram.width": "22px",
  "SOCIAL_LINKS.instagram.height": "22px",
  "SOCIAL_LINKS.x.label": "X",
  "SOCIAL_LINKS.x.url": "https://twitter.com/pollinations_ai",
  "SOCIAL_LINKS.x.width": "20px",
  "SOCIAL_LINKS.x.height": "20px",
  "SOCIAL_LINKS.youtube.label": "YouTube",
  "SOCIAL_LINKS.youtube.url": "https://www.youtube.com/c/pollinations",
  "SOCIAL_LINKS.youtube.width": "28px",
  "SOCIAL_LINKS.youtube.height": "28px",
  "SOCIAL_LINKS.tiktok.label": "Tiktok",
  "SOCIAL_LINKS.tiktok.url": "https://tiktok.com/@pollinations.ai",
  "SOCIAL_LINKS.tiktok.width": "27px",
  "SOCIAL_LINKS.tiktok.height": "27px"
};

// Background HTML (raw template literal)
export const PlantsAndTreesBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
            font-family: 'Courier New', Courier, monospace;
        }
        canvas {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 0;
        }
        #label {
            position: absolute;
            bottom: 20px;
            right: 20px;
            color: {{BACKGROUND_ELEMENT1}};
            opacity: 0.5;
            font-size: 10px;
            z-index: 1;
            pointer-events: none;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div id="label">pollinations.ai background</div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        // --- Configuration & Tokens ---
        const COLORS = {
            base: '{{BACKGROUND_BASE}}',
            wood: '{{BACKGROUND_ELEMENT1}}',
            leaf: '{{BACKGROUND_ELEMENT2}}',
            spore: '{{BACKGROUND_PARTICLE}}'
        };

        const SETTINGS = {
            treeCount: 15,
            particles: 200,
            animationSpeed: 0.0005,
            swayIntensity: 0.05
        };

        // Accessibility: Reduced Motion
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            SETTINGS.animationSpeed = 0;
            SETTINGS.swayIntensity = 0;
        }

        // --- Global Variables ---
        let scene, camera, renderer;
        let forestGroup, particleSystem;
        let time = 0;
        
        // --- Initialization ---
        function init() {
            initScene();
            initRenderer();
            createForest();
            createParticles();
            handleResize();
            animate();
        }

        function initScene() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.base);
            
            // Fog to blend distant trees into the background
            const bgCol = new THREE.Color(COLORS.base);
            scene.fog = new THREE.FogExp2(bgCol, 0.035);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
            // Position camera inside the "forest" looking slightly up
            camera.position.set(0, 5, 15);
            camera.lookAt(0, 8, 0);
        }

        function initRenderer() {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance cap
            document.body.appendChild(renderer.domElement);
            
            window.addEventListener('resize', handleResize);
        }

        // --- Asset Generation (Texture for Particles/Nodes) ---
        function createSoftCircleTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            
            const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 32, 32);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            return texture;
        }

        // --- Content Generation: The Fractal Forest ---
        function createForest() {
            forestGroup = new THREE.Group();
            
            // We will build a single geometry for all branches (lines) and one for all nodes (leaves)
            // to minimize draw calls.
            const branchPositions = [];
            const leafPositions = [];
            
            // Helper recursive function to grow a tree
            const growBranch = (startPos, direction, length, depth) => {
                if (depth === 0) {
                    leafPositions.push(startPos.x, startPos.y, startPos.z);
                    return;
                }

                // Calculate end point of this segment
                const endPos = startPos.clone().add(direction.clone().multiplyScalar(length));
                
                // Add line segment
                branchPositions.push(startPos.x, startPos.y, startPos.z);
                branchPositions.push(endPos.x, endPos.y, endPos.z);

                // Add a node at the joint sometimes
                if (Math.random() > 0.6) {
                    leafPositions.push(endPos.x, endPos.y, endPos.z);
                }

                // Branch out
                const numBranches = Math.floor(Math.random() * 2) + 2; // 2 or 3 branches
                for (let i = 0; i < numBranches; i++) {
                    // Randomize direction slightly
                    const angleX = (Math.random() - 0.5) * 1.5;
                    const angleZ = (Math.random() - 0.5) * 1.5;
                    const angleY = (Math.random() * 0.5) + 0.5; // Always mostly up

                    const newDir = new THREE.Vector3(angleX, angleY, angleZ).normalize();
                    // Smooth the transition from previous direction
                    newDir.add(direction).normalize();

                    growBranch(endPos, newDir, length * 0.75, depth - 1);
                }
            };

            // Generate trees scattered on the XZ plane
            for (let i = 0; i < SETTINGS.treeCount; i++) {
                const rootX = (Math.random() - 0.5) * 40;
                const rootZ = (Math.random() - 0.5) * 20 - 5; // Push back slightly
                const rootPos = new THREE.Vector3(rootX, -5, rootZ); // Start below view
                const upDir = new THREE.Vector3(0, 1, 0);
                
                growBranch(rootPos, upDir, 3.5, 5); // 5 levels deep
            }

            // Create Branch Mesh
            const branchGeo = new THREE.BufferGeometry();
            branchGeo.setAttribute('position', new THREE.Float32BufferAttribute(branchPositions, 3));
            
            const branchMat = new THREE.LineBasicMaterial({
                color: COLORS.wood,
                transparent: true,
                opacity: 0.4,
                depthWrite: false,
                linewidth: 1 // Note: WebGL line width is often locked to 1px
            });
            const branches = new THREE.LineSegments(branchGeo, branchMat);
            forestGroup.add(branches);

            // Create Leaf/Node Mesh
            const leafGeo = new THREE.BufferGeometry();
            leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3));
            
            const leafMat = new THREE.PointsMaterial({
                color: COLORS.leaf,
                size: 0.3,
                map: createSoftCircleTexture(),
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const leaves = new THREE.Points(leafGeo, leafMat);
            forestGroup.add(leaves);

            scene.add(forestGroup);
        }

        function createParticles() {
            const geo = new THREE.BufferGeometry();
            const pos = [];
            const sizes = [];
            
            for(let i=0; i<SETTINGS.particles; i++) {
                // Wide distribution
                pos.push((Math.random() - 0.5) * 50);
                pos.push((Math.random() * 20) - 5);
                pos.push((Math.random() - 0.5) * 30);
                
                sizes.push(Math.random() * 0.2 + 0.05);
            }
            
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            
            const mat = new THREE.PointsMaterial({
                color: COLORS.spore,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                map: createSoftCircleTexture(),
                blending: THREE.AdditiveBlending
            });
            
            // Adjust size attenuation in shader manually or just let Three handle perspective
            mat.sizeAttenuation = true; 
            
            particleSystem = new THREE.Points(geo, mat);
            scene.add(particleSystem);
        }

        // --- Animation Loop ---
        function animate() {
            requestAnimationFrame(animate);

            if (!prefersReducedMotion) {
                time += SETTINGS.animationSpeed;

                // 1. Forest Sway (simulating wind)
                // We rotate the entire forest group very slowly on a sine wave
                forestGroup.rotation.z = Math.sin(time) * SETTINGS.swayIntensity * 0.5;
                forestGroup.rotation.x = Math.cos(time * 0.7) * SETTINGS.swayIntensity * 0.2;

                // 2. Camera Drift
                // Gentle parallax motion
                camera.position.x = Math.sin(time * 0.5) * 1.0;
                camera.position.y = 5 + Math.cos(time * 0.3) * 0.5;
                camera.lookAt(0, 8, 0);

                // 3. Particle Float
                const positions = particleSystem.geometry.attributes.position.array;
                for (let i = 0; i < SETTINGS.particles; i++) {
                    const idx = i * 3;
                    // Move up slowly
                    positions[idx + 1] += 0.01; 
                    // Wiggle on X and Z
                    positions[idx] += Math.sin(time * 2 + i) * 0.002;
                    positions[idx + 2] += Math.cos(time * 1.5 + i) * 0.002;

                    // Reset if too high
                    if (positions[idx + 1] > 20) {
                        positions[idx + 1] = -5;
                    }
                }
                particleSystem.geometry.attributes.position.needsUpdate = true;
            }
            
            renderer.render(scene, camera);
        }

        function handleResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Start
        init();

    </script>
</body>
</html>`;
