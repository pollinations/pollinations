import type { LLMThemeResponse } from "../style/theme-processor";
import { processTheme } from "../style/theme-processor";
import { macrosToTheme } from "../style/simplified-to-theme";
import type { MacroConfig } from "../style/simplified-config.types";

const PALETTE = {
    charcoal: "#110518",
    grayDark: "#4A5557",
    gray: "#6E7A7C",
    grayMedium: "#BFCACC",
    grayLight: "#C7D4D6",
    grayUltraLight: "#DCE4E6",
    pink: "#FF69B4",
    yellow: "#ECF874",
    cyan: "#74F8EC",
    lime: "#BEF264",
};

export const ClassicMacroConfig: MacroConfig = {
    text: {
        primary: PALETTE.charcoal,
        secondary: PALETTE.grayDark,
        tertiary: PALETTE.gray,
        caption: PALETTE.gray,
        inverse: PALETTE.grayUltraLight,
        highlight: PALETTE.yellow,
    },
    surfaces: {
        page: PALETTE.grayLight,
        card: PALETTE.grayMedium,
        base: PALETTE.grayLight,
    },
    inputs: {
        bg: PALETTE.grayUltraLight,
        border: PALETTE.grayMedium,
        placeholder: PALETTE.gray,
    },
    buttons: {
        primary: {
            bg: PALETTE.charcoal,
            border: PALETTE.charcoal,
        },
        secondary: {
            bg: PALETTE.yellow,
            border: PALETTE.yellow,
        },
        ghost: {
            disabledBg: PALETTE.grayUltraLight,
            hoverOverlay: PALETTE.yellow,
            activeOverlay: PALETTE.yellow,
            focusRing: PALETTE.pink,
        },
    },
    borders: {
        highlight: PALETTE.yellow,
        main: PALETTE.gray,
        strong: PALETTE.charcoal,
        subtle: PALETTE.grayMedium,
        faint: PALETTE.grayMedium,
    },
    shadows: {
        brand: {
            sm: PALETTE.pink,
            md: PALETTE.pink,
            lg: PALETTE.pink,
        },
        dark: {
            sm: PALETTE.charcoal,
            md: PALETTE.charcoal,
            lg: PALETTE.charcoal,
            xl: PALETTE.charcoal,
        },
        highlight: {
            sm: PALETTE.lime,
            md: PALETTE.lime,
        },
    },
    brandSpecial: {
        brandMain: PALETTE.pink,
        logoMain: PALETTE.pink,
        logoAccent: PALETTE.yellow,
        indicatorImage: PALETTE.pink,
        indicatorText: PALETTE.yellow,
        indicatorAudio: PALETTE.cyan,
    },
    backgrounds: {
        base: PALETTE.grayLight, // Same as surface.base
        element1: PALETTE.pink, // Brand color for primary elements (filaments)
        element2: PALETTE.charcoal, // Dark for secondary elements (nodes)
        particle: PALETTE.yellow, // Highlight color for particles
    },
    typography: {
        title: "Maven Pro",
        headline: "Mako",
        body: "Duru Sans",
    },
    radius: {
        button: "0px",
        card: "0px",
        input: "0px",
        subcard: "0px",
    },
    opacity: {
        card: "0.5",
        overlay: "0.4",
        glass: "0.3",
    },
};

export const ClassicTheme: LLMThemeResponse = macrosToTheme(ClassicMacroConfig);
export const ClassicCssVariables = processTheme(ClassicTheme).cssVariables;

export const ClassicCopy = {
    "HELLO_PAGE.heroTitle": "Gen AI with a Human Touch",
    "HELLO_PAGE.heroIntro":
        "We're a small, passionate team building a different kind of AI platform—one that's simple, beautiful, and built in direct partnership with our community.",
    "HELLO_PAGE.heroTagline":
        "Whether you need a reliable API that just works or a partner to sponsor your next big idea, you've found your home.",
    "HELLO_PAGE.pollenTitle": "Pollen: One Simple Credit for Everything",
    "HELLO_PAGE.pollenDescription":
        "Pollen is our single, unified credit for all generative media. It's the elegant solution to a chaotic landscape, designed to be predictable and fair for every type of builder.",
    "HELLO_PAGE.getPollenTitle": "Fuel Your Vision: Get Pollen Your Way",
    "HELLO_PAGE.getPollenIntro":
        "Our platform is designed for flexibility. Every developer can purchase Pollen directly, and those we partner with also receive a daily grant to kickstart their journey.",
    "HELLO_PAGE.buyCardTitle": "Simple & Fast: Buy What You Need",
    "HELLO_PAGE.buyCardDescription":
        "Have an idea and just need a great API to power it? Buy Pollen packs and start building in minutes. No strings attached.",
    "HELLO_PAGE.sponsorshipCardTitle":
        "Our Investment in You: The Sponsorship Program",
    "HELLO_PAGE.sponsorshipCardDescription":
        "We sponsor developers building the next wave of creative apps. As a partner, you receive a free daily Pollen grant to de-risk development and get your project off the ground.",
    "HELLO_PAGE.sponsorshipTiersTitle": "Grow With Us: The Sponsorship Tiers",
    "HELLO_PAGE.sponsorshipTiersDescription":
        "For our sponsored partners, the journey is a gamified path that rewards your progress. Start as a Spore with a daily grant, then grow to Seed, Flower, and Nectar.",
    "HELLO_PAGE.creativeLaunchpadTitle": "Your Creative Launchpad",
    "HELLO_PAGE.creativeLaunchpadIntro":
        "No matter how you get your Pollen, you get access to our high-level creative engines. We handle the complexity so you can focus on your vision.",
    "HELLO_PAGE.differenceTitle": "The Pollinations Difference",
    "HELLO_PAGE.differenceIntro":
        "Why build with us? Because we're building for you.",
    "HELLO_PAGE.roadmapTitle": "The Horizon: An Open Creative Economy",
    "HELLO_PAGE.roadmapIntro":
        "Our roadmap is focused on enabling success for every developer on our platform.",
    "HELLO_PAGE.roadmapComingSoonTitle": "Secure Front-End Spending",
    "HELLO_PAGE.roadmapComingSoonDescription":
        "The foundational tech allowing client-side apps to spend Pollen, a key step for monetization.",
    "HELLO_PAGE.roadmapQ1Title": "In-App Purchase",
    "HELLO_PAGE.roadmapQ1Description":
        "The economy opens. Users can buy Pollen inside your app, and you get a bonus for every purchase. This is the goal for our sponsored partners.",
    "HELLO_PAGE.roadmapOngoingTitle": "Beyond",
    "HELLO_PAGE.roadmapOngoingDescription":
        "We're moving towards a complete solution for AI app development, including hosting and app discovery.",
    "HELLO_PAGE.ctaTitle": "Ready to Create?",
    "HELLO_PAGE.ctaDescription":
        "Stop choosing between power and personality. Build with a platform that offers both.",
    "APPS_PAGE.title": "Ecosystem",
    "APPS_PAGE.subtitle":
        "Community-built apps, tools, and experiments—all Pollinations-powered. Browse, try, ship.",
    "DOCS_PAGE.title": "Integrate",
    "DOCS_PAGE.intro":
        "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
    "DOCS_PAGE.apiReference":
        "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
    "DOCS_PAGE.imageGenerationTitle": "Image Generation",
    "DOCS_PAGE.textGenerationTitle": "Text Generation",
    "DOCS_PAGE.modelDiscoveryTitle": "Model Discovery",
    "DOCS_PAGE.authenticationTitle": "Authentication",
    "COMMUNITY_PAGE.title": "Contribute",
    "COMMUNITY_PAGE.subtitle":
        "We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate together.",
    "COMMUNITY_PAGE.newsTitle": "What's New",
    "COMMUNITY_PAGE.discordTitle": "Discord",
    "COMMUNITY_PAGE.discordSubtitle":
        "Join our community for real-time discussions and support.",
    "COMMUNITY_PAGE.githubTitle": "GitHub",
    "COMMUNITY_PAGE.githubSubtitle":
        "Collaborate on open-source projects and contribute code.",
    "COMMUNITY_PAGE.supportersTitle": "Supporters",
    "COMMUNITY_PAGE.supportersSubtitle":
        "We're grateful to our supporters for their contributions to our platform.",
    "PLAY_PAGE.createTitle": "Create",
    "PLAY_PAGE.watchTitle": "Watch",
    "PLAY_PAGE.createDescription":
        "Test our API, play with different models, and see what you can create. This is a fun demo playground—not our main product, just a place to explore and experiment.",
    "PLAY_PAGE.feedDescription":
        "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
    "PLAY_PAGE.toggleWatchOthers": "Watch what others are making",
    "PLAY_PAGE.toggleBackToPlay": "Back to Play",
};
// Background HTML (base64 encoded to avoid escaping issues)
export const ClassicBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Organic Symbiosis Ambient Background</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #F1EEE7;
      }
      #bg-canvas {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        display: block;
        z-index: 0;
        background: #F1EEE7;
      }
      #overlay-label {
        position: absolute;
        left: 16px;
        bottom: 16px;
        color: #2E2E2E;
        font-family: 'Roboto', Arial, sans-serif;
        font-size: 13px;
        background: rgba(241,238,231,0.8);
        padding: 4px 8px;
        border-radius: 8px;
        pointer-events: none;
        user-select: none;
        letter-spacing: 0.04em;
        z-index: 1;
      }
      @media (max-width: 600px) {
        #overlay-label {
          font-size: 11px;
        }
      }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap" rel="stylesheet">
  </head>
  <body>
    <canvas id="bg-canvas"></canvas>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';

      // Theme Prompt: "luminous underground mycelium network"
      // Colors: #1A1A1A (deep filaments) / #2E2E2E (nodes) / #A49A88 (luminescent spores), BG: #F1EEE7

      let renderer, scene, camera, filaments = [], spores = [], nodes = [];
      const CANVAS_ID = "bg-canvas";
      const COLORS = {
        sceneBackground: '{{BACKGROUND_BASE}}',
        filaments: '{{BACKGROUND_ELEMENT1}}',
        nodes: '{{BACKGROUND_ELEMENT2}}',
        particles: '{{BACKGROUND_PARTICLE}}'
      };

      const BG_COLOR = parseInt(COLORS.sceneBackground.replace('#', ''), 16);
      const FILAMENT_COLOR = parseInt(COLORS.filaments.replace('#', ''), 16); // branch-like lines
      const NODE_COLOR = parseInt(COLORS.nodes.replace('#', ''), 16); // junction spheres
      const SPORE_COLOR = parseInt(COLORS.particles.replace('#', ''), 16); // floating glowing spores
      const prefersStatic = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function initRenderer() {
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(CANVAS_ID), antialias: true });
        renderer.setClearColor(BG_COLOR, 1);
        resize();
        window.addEventListener("resize", resize, false);
      }

      function resize() {
        const dpr = window.devicePixelRatio || 1;
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setPixelRatio(dpr);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }

      function initCamera() {
        camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 0.1, 100);
        camera.position.set(0, 0, 8.5);
      }

      function initScene() {
        scene = new THREE.Scene();
        // Scene stays gentle, avoid post-processing.
        createOrganicElements();
      }

      function createOrganicElements() {
        // Mycelium filaments: branching, organic splines
        const filamentMaterial = new THREE.LineBasicMaterial({ color: FILAMENT_COLOR, transparent: true, opacity: 0.34 });
        const branches = 7, segs = 18, spread = 2.6;
        for (let i=0; i < branches; i++) {
          const curve = new THREE.CatmullRomCurve3(
            Array.from({length: segs}, (_, s) => {
              const t = s/(segs-1);
              // Organic, twisty branching
              const angle = Math.PI*2 * (i/branches) + t*2.1 + Math.sin(i*0.65-t*2.3)*0.2;
              const rad = spread*(0.5+t*0.8) + Math.sin(t*2.5+i)*0.2;
              return new THREE.Vector3(
                Math.cos(angle)*rad + Math.sin(t*3+i)*0.22,
                Math.sin(angle)*rad + Math.cos(t*4-i)*0.18,
                Math.sin(t*Math.PI*2+i*0.19)*0.27
              );
            })
          );
          const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
          const line = new THREE.Line(geom, filamentMaterial.clone());
          filaments.push(line);
          scene.add(line);
        }

        // Nodes: clustering spheres at filament ends
        const nodeMaterial = new THREE.MeshBasicMaterial({
          color: NODE_COLOR,
          transparent: true, opacity: 0.42
        });
        for (let i=0; i<branches; i++) {
          const pt = filaments[i].geometry.attributes.position;
          const last = pt.count - 1;
          const pos = new THREE.Vector3(
            pt.getX(last), pt.getY(last), pt.getZ(last)
          );
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.28 + 0.06*Math.random(), 14, 12),
            nodeMaterial.clone()
          );
          mesh.position.copy(pos);
          nodes.push(mesh);
          scene.add(mesh);
        }

        // Luminescent spores: subtle glowing particles drifting beneath filaments
        const sporeGeom = new THREE.SphereGeometry(0.09, 8,8);
        const sporeMaterial = new THREE.MeshBasicMaterial({
          color: SPORE_COLOR,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          premultipliedAlpha: true
        });
        for (let j=0;j<19;j++) {
          const mesh = new THREE.Mesh(sporeGeom, sporeMaterial.clone());
          mesh.position.set(
            (Math.random()-0.5)*5.4,
            (Math.random()-0.5)*3.8,
            -0.7 + Math.random()*2.2
          );
          mesh.userData = {
            phase: Math.random()*Math.PI*2,
            speed: 0.04 + Math.random()*0.07,
            offset: Math.random()*2
          }
          spores.push(mesh);
          scene.add(mesh);
        }

        // Subtle dim point lights for organic ambiance
        const l1 = new THREE.PointLight(0xA49A88, 0.44, 13);
        l1.position.set(-1.4, 1.4, 2.6);
        scene.add(l1);
        const l2 = new THREE.PointLight(0x2E2E2E, 0.16, 8);
        l2.position.set(2.2, -2, 2.6);
        scene.add(l2);
      }

      let clock = new THREE.Clock();

      // Slight camera drift/parallax
      let camDrift = { x: 0, y: 0 };
      let mouse = { x: 0, y: 0 };
      document.addEventListener("mousemove", e => {
        mouse.x = (e.clientX / window.innerWidth - 0.5)*1.4;
        mouse.y = (e.clientY / window.innerHeight - 0.5)*1.2;
      });

      function animate() {
        const time = clock.getElapsedTime();
        if (!prefersStatic) {
          camDrift.x += (mouse.x - camDrift.x)*0.04;
          camDrift.y += (mouse.y - camDrift.y)*0.04;
          camera.position.x = camDrift.x*0.35;
          camera.position.y = camDrift.y*0.35 + Math.sin(time*0.18)*0.04;

          // Filaments gently breathe and pulse
          filaments.forEach((line, i) => {
            const arr = line.geometry.attributes.position;
            for (let idx=0;idx<arr.count;idx++) {
              let ot = idx/(arr.count-1);
              let baseX = arr.getX(idx), baseY = arr.getY(idx);
              let mag = Math.sin(time*0.17+ot*2.3+i*0.97)*0.09*ot;
              arr.setX(idx, baseX+mag*Math.cos(i+ot*2.3));
              arr.setY(idx, baseY+mag*Math.sin(i-ot*2.6));
            }
            arr.needsUpdate = true;
          });

          // Spores drift softly
          spores.forEach((spore, idx) => {
            const { phase,speed,offset } = spore.userData;
            spore.position.x += Math.sin(time*speed+phase+offset)*0.0025 + Math.cos(idx+time*0.05)*0.0009;
            spore.position.y += Math.cos(time*speed+phase-offset)*0.0025 + Math.sin(idx-time*0.05)*0.0014;
            // Soft flicker effect for luminance
            spore.material.opacity = 0.38 + Math.abs(Math.sin(time*0.74+phase+offset))*0.22;
          });

          // Nodes gently pulse glow
          nodes.forEach((node, i) => {
            node.material.opacity = 0.38 + Math.sin(time*0.43 + i*0.8)*0.12;
            node.scale.setScalar(1 + Math.sin(time*0.38 + i*0.6)*0.07);
          });
        } else {
          // Reduced motion: only slight static randomness
          camera.position.x = 0;
          camera.position.y = 0;
          filaments.forEach((line, i) => {
            const arr = line.geometry.attributes.position;
            for (let idx=0;idx<arr.count;idx++) {
              let ot = idx/(arr.count-1);
              let mag = Math.sin(i*ot*2.3)*0.06*ot;
              arr.setX(idx, arr.getX(idx)+mag*0.35);
              arr.setY(idx, arr.getY(idx)+mag*0.23);
            }
            arr.needsUpdate = true;
          });
        }

        camera.lookAt(0,0,0);
        renderer.render(scene, camera);
        if (!prefersStatic) requestAnimationFrame(animate);
      }

      function start() {
        initCamera();
        initRenderer();
        initScene();
        if (!prefersStatic) animate();
        else animate();  // Run once for static
      }

      start();
    </script>
  </body>
</html>`;
