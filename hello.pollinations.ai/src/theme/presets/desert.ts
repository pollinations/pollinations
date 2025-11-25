import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const DesertTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#1F1F1F",
      "ids": [
        "text.primary"
      ]
    },
    "slot_1": {
      "hex": "#3A3A3A",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#BFA49C",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_3": {
      "hex": "#8A5C2E",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_4": {
      "hex": "#F7EDE1",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_5": {
      "hex": "#D6C6A9",
      "ids": [
        "button.secondary.border"
      ]
    },
    "slot_6": {
      "hex": "#EDE6DF",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_7": {
      "hex": "#000000",
      "ids": [
        "button.hover.overlay",
        "button.active.overlay",
        "shadow.brand.sm",
        "shadow.brand.md",
        "shadow.brand.lg"
      ]
    },
    "slot_8": {
      "hex": "#2A2A2A",
      "ids": [
        "indicator.text",
        "border.strong",
        "shadow.dark.lg"
      ]
    },
    "slot_9": {
      "hex": "#C0562E",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_10": {
      "hex": "#E7D8B9",
      "ids": [
        "border.main"
      ]
    },
    "slot_11": {
      "hex": "#C8B89F",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_12": {
      "hex": "#5A5A5A",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#EDE1D4",
      "ids": [
        "border.faint"
      ]
    },
    "slot_14": {
      "hex": "#0E0E0E",
      "ids": [
        "shadow.dark.sm"
      ]
    },
    "slot_15": {
      "hex": "#1A1A1A",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_16": {
      "hex": "#383838",
      "ids": [
        "shadow.dark.xl"
      ]
    },
    "slot_17": {
      "hex": "#E1A867",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_18": {
      "hex": "#7A8A63",
      "ids": [
        "logo.accent",
        "background.element2"
      ]
    },
    "slot_19": {
      "hex": "#FFB07C",
      "ids": [
        "background.particle"
      ]
    },
    "slot_20": {
      "hex": "#7A7A7A",
      "ids": [
        "text.caption"
      ]
    },
    "slot_21": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "input.bg"
      ]
    },
    "slot_22": {
      "hex": "#D4A373",
      "ids": [
        "text.brand",
        "text.highlight",
        "button.primary.bg",
        "button.focus.ring",
        "border.brand",
        "border.highlight",
        "shadow.highlight.sm",
        "logo.main",
        "background.element1"
      ]
    },
    "slot_23": {
      "hex": "#F5EDE3",
      "ids": [
        "surface.page",
        "indicator.image",
        "background.base"
      ]
    },
    "slot_24": {
      "hex": "#FFF7EC",
      "ids": [
        "surface.card"
      ]
    },
    "slot_25": {
      "hex": "#F0E5D6",
      "ids": [
        "surface.base"
      ]
    },
    "slot_26": {
      "hex": "#D2B48C",
      "ids": [
        "input.border"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "16px",
    "radius.card": "20px",
    "radius.input": "12px",
    "radius.subcard": "14px"
  },
  "fonts": {
    "font.title": "Playfair Display",
    "font.headline": "Inter",
    "font.body": "Inter"
  },
  "opacity": {
    "opacity.card": "0.95",
    "opacity.overlay": "0.85",
    "opacity.glass": "0.75"
  }
};

export const DesertCssVariables = processTheme(DesertTheme).cssVariables;

// Copy generated with prompt: "desert"
export const DesertCopy = {
  "APPS_PAGE.subtitle": "Oasis-built apps, tools, and experiments—Pollinations-powered. Browse, try, ship.",
  "COMMUNITY_PAGE.subtitle": "We're forging a desert haven where developers, creators, and AI enthusiasts collaborate and bloom.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our desert community for chats and help.",
  "COMMUNITY_PAGE.githubSubtitle": "Collaborate on open-source trails and contribute code.",
  "COMMUNITY_PAGE.supportersSubtitle": "We thank our supporters for their contributions to the platform.",
  "HELLO_PAGE.heroTitle": "Desert AI platform for creative developers."
};

// Background HTML (raw template literal)
export const DesertBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Organic Biosphere Background - pollinations.ai</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        background: {{BACKGROUND_BASE}};
        overflow: hidden;
      }
      #bg-canvas {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        pointer-events: none;
        z-index: 0;
        display: block;
      }
      #bg-label {
        position: fixed;
        left: 16px; bottom: 14px;
        font-family: 'Roboto Mono', monospace;
        font-size: 13px;
        background: rgba(0,0,0,0.35);
        color: {{BACKGROUND_ELEMENT2}};
        padding: 4px 10px;
        border-radius: 7px;
        z-index: 10;
        user-select: none;
        opacity: 0.70;
        letter-spacing: 0.02em;
        pointer-events: none;
      }
    </style>
    <link href="https://fonts.googleapis.com/css?family=Roboto+Mono:400" rel="stylesheet">
  </head>
  <body>
    <canvas id="bg-canvas"></canvas>
    <div id="bg-label">pollinations.ai background</div>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';

      // === Theme: "luminous underground mycelium network" ===

      const COLORS = {
        sceneBackground: '{{BACKGROUND_BASE}}',
        filaments: '{{BACKGROUND_ELEMENT1}}',
        nodes: '{{BACKGROUND_ELEMENT2}}',
        particles: '{{BACKGROUND_PARTICLE}}'
      };

      let renderer, scene, camera;
      let filaments = [], nodes = [], spores = [];
      let prefersReducedMotion;

      function initRenderer() {
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);
        camera.position.set(0, 0, 22);
      }

      function createOrganicElements() {
        // Soft random branches (filaments), glowing junctions (nodes), floating spores
        const filamentCount = 15;
        const nodeCount = 18;
        const sporeCount = 38;

        // Filaments: branched lines
        for (let i = 0; i < filamentCount; i++) {
          const points = [];
          let baseAngle = Math.random() * Math.PI * 2;
          let radius = 7 + Math.random() * 3;
          let segments = 6 + Math.floor(Math.random() * 3);
          let spread = 2 + Math.random() * 1.6;

          let cur = new THREE.Vector3(
            Math.cos(baseAngle) * radius,
            Math.sin(baseAngle) * radius,
            (Math.random()-0.5) * 3
          );

          for (let s = 0; s < segments; s++) {
            const branch = cur.clone();
            branch.x += (Math.sin(baseAngle + s * 0.4) * spread + (Math.random()-0.5)*0.5) * 0.8;
            branch.y += (Math.cos(baseAngle + s * 0.5) * spread  + (Math.random()-0.5)*0.3) * 0.7;
            branch.z += ((Math.random()-0.5)*1.4) * 0.6;
            points.push(branch.clone());
          }

          const curve = new THREE.CatmullRomCurve3(points);
          const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(32));
          const filamentMat = new THREE.LineBasicMaterial({
            color: COLORS.filaments,
            linewidth: 2,
            opacity: 0.72 + Math.random()*0.2,
            transparent: true
          });
          filaments.push(new THREE.Line(geometry, filamentMat));
        }

        // Nodes: softly glowing orbs at filament junctions
        for (let i = 0; i < nodeCount; i++) {
          const geom = new THREE.SphereGeometry(0.36 + Math.random()*0.18, 16, 16);
          const mat = new THREE.MeshBasicMaterial({
            color: COLORS.nodes,
            transparent: true,
            opacity: 0.72 + Math.random()*0.2
          });
          const mesh = new THREE.Mesh(geom, mat);

          // Place near some filament branches
          let angle = Math.random() * Math.PI * 2;
          let radius = 5.3 + Math.random() * 5.8;
          mesh.position.set(
            Math.cos(angle) * radius + (Math.random()-0.5)*1.5,
            Math.sin(angle) * radius + (Math.random()-0.5)*1.7,
            (Math.random()-0.5)*6
          );
          nodes.push(mesh);
        }

        // Spores: tiny floating particles
        for (let i = 0; i < sporeCount; i++) {
          const geom = new THREE.SphereGeometry(0.12 + Math.random()*0.06, 10, 10);
          const mat = new THREE.MeshBasicMaterial({
            color: COLORS.particles,
            transparent: true,
            opacity: 0.4 + Math.random()*0.5
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(
            (Math.random()-0.5)*13,
            (Math.random()-0.5)*7.5,
            (Math.random()-0.5)*12
          );
          mesh.userData = {
            basePos: mesh.position.clone(),
            floatPhase: Math.random()*Math.PI*2,
            floatMag: 0.6 + Math.random()*0.5,
            speed: 0.08 + Math.random()*0.06
          };
          spores.push(mesh);
        }

        filaments.forEach(f => scene.add(f));
        nodes.forEach(n => scene.add(n));
        spores.forEach(s => scene.add(s));
      }

      function onResize() {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }

      function getPrefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }

      // Subtle camera drift and animated spores
      let timeStart = performance.now();
      let camDriftPhase = Math.random() * Math.PI * 2;

      function animate(now) {
        prefersReducedMotion = getPrefersReducedMotion();
        let elapsed = (now - timeStart) * 0.001;

        // Camera drift (gentle sway)
        if (!prefersReducedMotion) {
          camera.position.x = Math.sin(elapsed*0.15 + camDriftPhase) * 0.8;
          camera.position.y = Math.sin(elapsed*0.13 + camDriftPhase*0.7) * 0.5;
          camera.lookAt(0, 0, 0);
        } else {
          camera.position.x = 0;
          camera.position.y = 0;
          camera.lookAt(0, 0, 0);
        }

        // Spores float gently, unless reduced motion
        spores.forEach(spore => {
          if (!prefersReducedMotion) {
            let ud = spore.userData;
            let floatY = Math.sin(elapsed*ud.speed + ud.floatPhase) * ud.floatMag;
            spore.position.y = ud.basePos.y + floatY * 0.5;
            spore.position.x = ud.basePos.x + Math.sin(elapsed*ud.speed*0.8 + ud.floatPhase*1.5)*0.36;
          } else {
            spore.position.copy(spore.userData.basePos);
          }
        });

        // Nodes pulse a little
        nodes.forEach(node => {
          if (!prefersReducedMotion) {
            node.material.opacity = 0.68 + Math.sin(elapsed*0.7 + node.position.x*0.2)*0.16;
          }
        });

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      // Start!
      function start() {
        prefersReducedMotion = getPrefersReducedMotion();
        initRenderer();
        initScene();
        createOrganicElements();
        window.addEventListener('resize', onResize, { passive: true });
        requestAnimationFrame(animate);
      }

      start();
    </script>
  </body>
</html>`;
