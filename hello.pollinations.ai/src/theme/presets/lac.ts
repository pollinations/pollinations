import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const LacTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#0B1D3A",
      "ids": [
        "text.primary",
        "background.element2"
      ]
    },
    "slot_1": {
      "hex": "#1F2A44",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#93A4BF",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_3": {
      "hex": "#1A56D1",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_4": {
      "hex": "#4DA3FF",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_5": {
      "hex": "#F5F7FB",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_6": {
      "hex": "#000000",
      "ids": [
        "button.hover.overlay",
        "button.active.overlay"
      ]
    },
    "slot_7": {
      "hex": "#7FE3FF",
      "ids": [
        "indicator.image"
      ]
    },
    "slot_8": {
      "hex": "#1B3B6F",
      "ids": [
        "indicator.text"
      ]
    },
    "slot_9": {
      "hex": "#0A1D3A",
      "ids": [
        "border.strong"
      ]
    },
    "slot_10": {
      "hex": "#BBD4F9",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_11": {
      "hex": "#E8F0FF",
      "ids": [
        "border.faint"
      ]
    },
    "slot_12": {
      "hex": "#324067",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#1E5ACC",
      "ids": [
        "shadow.brand.md"
      ]
    },
    "slot_14": {
      "hex": "#0E3A78",
      "ids": [
        "shadow.brand.lg"
      ]
    },
    "slot_15": {
      "hex": "#0E0E14",
      "ids": [
        "shadow.dark.sm"
      ]
    },
    "slot_16": {
      "hex": "#0C0C12",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_17": {
      "hex": "#0A0A10",
      "ids": [
        "shadow.dark.lg"
      ]
    },
    "slot_18": {
      "hex": "#08080E",
      "ids": [
        "shadow.dark.xl"
      ]
    },
    "slot_19": {
      "hex": "#0E9AA5",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_20": {
      "hex": "#52A0FF",
      "ids": [
        "logo.accent"
      ]
    },
    "slot_21": {
      "hex": "#9BD6FF",
      "ids": [
        "background.particle"
      ]
    },
    "slot_22": {
      "hex": "#6B7A90",
      "ids": [
        "text.caption"
      ]
    },
    "slot_23": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "surface.card",
        "input.bg"
      ]
    },
    "slot_24": {
      "hex": "#2A6CFF",
      "ids": [
        "text.brand",
        "button.primary.bg",
        "button.secondary.border",
        "border.brand",
        "shadow.brand.sm",
        "logo.main",
        "background.element1"
      ]
    },
    "slot_25": {
      "hex": "#2EC4B6",
      "ids": [
        "text.highlight",
        "button.focus.ring",
        "indicator.audio",
        "border.highlight",
        "shadow.highlight.sm"
      ]
    },
    "slot_26": {
      "hex": "#F5FAFF",
      "ids": [
        "surface.page",
        "background.base"
      ]
    },
    "slot_27": {
      "hex": "#F2F7FF",
      "ids": [
        "surface.base"
      ]
    },
    "slot_28": {
      "hex": "#D6E2F7",
      "ids": [
        "input.border",
        "border.main"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "12px",
    "radius.card": "16px",
    "radius.input": "8px",
    "radius.subcard": "10px"
  },
  "fonts": {
    "font.title": "Poppins",
    "font.headline": "Poppins",
    "font.body": "Inter"
  },
  "opacity": {}
};

export const LacCssVariables = processTheme(LacTheme).cssVariables;

// Copy generated with prompt: "lac"
export const LacCopy = {
  "APPS_PAGE.subtitle": "Pollinations-powered apps and experiments. Browse, try, ship.",
  "COMMUNITY_PAGE.subtitle": "A haven for developers, creators, and AI enthusiasts to bloom together.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our sunlit community for chats and support.",
  "COMMUNITY_PAGE.githubSubtitle": "Collaborate on open-source projects and contribute code.",
  "COMMUNITY_PAGE.supportersSubtitle": "Grateful to our supporters and their contributions to the platform.",
  "HELLO_PAGE.heroTitle": "An AI platform for creative developers."
};

// Background HTML (raw template literal)
export const LacBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Organic Ambient WebGL Background</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <!-- Optional Google Font for overlay label -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500&display=swap" rel="stylesheet">
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100vw;
        overflow: hidden;
        background: {{BACKGROUND_BASE}};
      }
      body {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #bg-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: block;
        pointer-events: none;
        z-index: 0;
      }
      .bg-label {
        position: absolute;
        bottom: 10px;
        right: 16px;
        font-family: 'Montserrat', sans-serif;
        font-size: 12px;
        background: rgba(0,0,0,0.55);
        color: #e0e0e0;
        padding: 4px 10px;
        border-radius: 8px;
        letter-spacing: 0.6px;
        user-select: none;
        z-index: 1;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <canvas id="bg-canvas"></canvas>
    <div class="bg-label">pollinations.ai background</div>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';

      // replace these with actual hex color values at runtime
      const COLORS = {
        sceneBackground: '{{BACKGROUND_BASE}}',
        filaments: '{{BACKGROUND_ELEMENT1}}',
        nodes: '{{BACKGROUND_ELEMENT2}}',
        particles: '{{BACKGROUND_PARTICLE}}'
      };

      const THEME_PROMPT = 'luminous underground mycelium network'; // example, replace at runtime

      let renderer, scene, camera;
      let filaments = [], nodes = [], particles = [];
      let time = 0;
      let prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function initRenderer() {
        renderer = new THREE.WebGLRenderer({
          canvas: document.getElementById('bg-canvas'),
          antialias: true,
          alpha: false
        });
        renderer.setClearColor(COLORS.sceneBackground, 1);
        resizeRenderer();
        window.addEventListener('resize', resizeRenderer);
      }

      function resizeRenderer() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      function initCamera() {
        camera = new THREE.PerspectiveCamera(
          45, window.innerWidth / window.innerHeight, 0.1, 200
        );
        camera.position.set(0, 0, 20);
      }

      function createOrganicElements() {
        // Create mycelium filaments (lines) and nodes (glowing junctions)
        // The network is 3D, softly irregular, loosely radial
        const filamentMaterial = new THREE.LineBasicMaterial({
          color: COLORS.filaments,
          transparent: true,
          opacity: 0.37,
          premultipliedAlpha: true
        });
        const nodeMaterial = new THREE.MeshBasicMaterial({
          color: COLORS.nodes,
          transparent: true,
          opacity: 0.7,
          premultipliedAlpha: true
        });
        const filamentCount = 14;
        const nodesPerFilament = 5 + Math.floor(Math.random() * 4);

        for (let i = 0; i < filamentCount; i++) {
          const points = [];
          const theta = (i / filamentCount) * Math.PI * 2;

          let baseRadius = 4.5 + Math.random() * 1.3;
          for (let j = 0; j < nodesPerFilament; j++) {
            // organic branching offset
            let t = j / (nodesPerFilament - 1);
            let r = baseRadius * (0.9 + Math.random() * 0.14);
            let angle = theta + (Math.sin(t * Math.PI) * 0.33 * (Math.random() - 0.5));
            let x = Math.cos(angle) * r * (0.5 + t) + ((Math.random() - 0.5) * 0.45 * j);
            let y = Math.sin(angle) * r * (0.6 + 0.3 * t) + ((Math.random() - 0.5) * 0.36 * j);
            let z = ((t - 0.5) * 2.8 * r) + (Math.sin(angle * 2) * 0.7) + ((Math.random() - 0.5) * 0.76 * j);
            points.push(new THREE.Vector3(x, y, z));
          }
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, filamentMaterial);
          scene.add(line);
          filaments.push({line, points, theta, baseRadius});

          // Create softly glowing nodes at filament points
          for (let j = 0; j < points.length; j++) {
            const sphereGeometry = new THREE.SphereGeometry(0.22 + Math.random() * 0.09, 16, 8);
            const node = new THREE.Mesh(sphereGeometry, nodeMaterial.clone());
            node.position.copy(points[j]);
            node.material.opacity = 0.54 + Math.random()*0.16;
            // Some nodes pulse gently
            node.userData = { pulse: Math.random() < 0.45 ? (0.6 + Math.random()*0.8) : 0 };
            scene.add(node);
            nodes.push(node);
          }
        }

        // Floating spores/particles (glowing moving dots)
        let particleMaterial = new THREE.MeshBasicMaterial({
          color: COLORS.particles,
          transparent: true,
          opacity: 0.48,
          premultipliedAlpha: true
        });
        const particleGeometry = new THREE.SphereGeometry(0.11, 12, 6);
        const particleCount = 28;
        for (let i = 0; i < particleCount; i++) {
          const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
          // Random position in a subtle 3D volume, center clustered
          let r = 4.8 + Math.random() * 4;
          let theta = Math.random() * Math.PI * 2;
          let phi = Math.acos(2 * Math.random() - 1);
          particle.position.set(
            Math.sin(phi) * Math.cos(theta) * r,
            Math.sin(phi) * Math.sin(theta) * r,
            Math.cos(phi) * r * 0.5
          );
          // Animation params
          particle.userData = {
            basePos: particle.position.clone(),
            tOffset: Math.random() * 5,
            floatSpeed: 0.15 + Math.random() * 0.12
          };
          scene.add(particle);
          particles.push(particle);
        }
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);
      }

      function gentleCameraDrift(t) {
        // subtle drift + occasional slow parallax to add "living" motion
        const driftRadius = prefersReducedMotion ? 0 : 0.53;
        const angle = t * 0.18;
        camera.position.x = Math.sin(angle * 0.31) * driftRadius;
        camera.position.y = Math.sin(angle * 0.2) * driftRadius * 0.5;
        camera.position.z = 20 + Math.sin(angle) * (prefersReducedMotion ? 0 : 0.08);
        camera.lookAt(0, 0, 0);
      }

      // slow organic undulation for filaments and node pulsing
      function animateFilamentsNodes(t) {
        if (prefersReducedMotion) return;
        filaments.forEach((item, i) => {
          // undulate each point along radial filaments
          let pts = item.points;
          let geo = item.line.geometry;
          for (let j = 0; j < pts.length; j++) {
            let pt = pts[j];
            let modPt = pt.clone();
            modPt.x += Math.sin(t * 0.21 + j * 0.28 + i * 0.14) * (0.08 + j*0.07);
            modPt.y += Math.cos(t * 0.17 + j * 0.29 + i * 0.19) * (0.07 + j*0.06);
            modPt.z += Math.sin(t * 0.13 + j * 0.32 + i * 0.15) * (0.09 + j*0.09);
            geo.attributes.position.setXYZ(j, modPt.x, modPt.y, modPt.z);
          }
          geo.attributes.position.needsUpdate = true;
        });
        // pulse nodes
        nodes.forEach((node, ni) => {
          let p = node.userData.pulse;
          if (p > 0) {
            let baseScale = 1.0 + p * 0.15;
            node.scale.setScalar(baseScale + Math.sin(t * 0.85 + ni*0.19) * (p * 0.15));
            node.material.opacity = 0.42 + Math.abs(Math.cos(t * 0.7 + ni*0.13)) * 0.28;
          } else {
            node.scale.setScalar(1.0);
          }
        });
      }

      // floating spores/particles drift slowly
      function animateParticles(t) {
        if (prefersReducedMotion) return;
        particles.forEach((particle, pi) => {
          let base = particle.userData.basePos;
          let offset = particle.userData.tOffset;
          let float = particle.userData.floatSpeed;
          particle.position.x = base.x + Math.sin(t * float + offset) * 0.32;
          particle.position.y = base.y + Math.cos(t * float * 1.19 + offset) * 0.27;
          particle.position.z = base.z + Math.sin(t * float * 0.73 + offset) * 0.14;
        });
      }

      function animate() {
        time = performance.now() * 0.001;
        gentleCameraDrift(time);
        animateFilamentsNodes(time);
        animateParticles(time);
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      // If reduced motion, freeze all animations after initial render.
      function staticRender() {
        gentleCameraDrift(0);
        renderer.render(scene, camera);
      }

      function main() {
        initScene();
        initCamera();
        initRenderer();
        createOrganicElements();
        if (prefersReducedMotion) {
          staticRender();
        } else {
          animate();
        }
      }

      main();
    </script>
  </body>
</html>`;
