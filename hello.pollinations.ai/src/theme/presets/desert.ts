import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const DesertTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#1A1A1A",
      "ids": [
        "text.primary",
        "indicator.text",
        "shadow.dark.sm"
      ]
    },
    "slot_1": {
      "hex": "#2C2C2C",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#9A8F7F",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_3": {
      "hex": "#C05A25",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_4": {
      "hex": "#F6E9D6",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_5": {
      "hex": "#D8C7A8",
      "ids": [
        "button.secondary.border"
      ]
    },
    "slot_6": {
      "hex": "#EEE5D4",
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
        "shadow.brand.lg",
        "shadow.dark.lg",
        "shadow.dark.xl"
      ]
    },
    "slot_8": {
      "hex": "#F5C96D",
      "ids": [
        "button.focus.ring"
      ]
    },
    "slot_9": {
      "hex": "#E6B138",
      "ids": [
        "indicator.image"
      ]
    },
    "slot_10": {
      "hex": "#4A90E2",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_11": {
      "hex": "#C9B089",
      "ids": [
        "border.main"
      ]
    },
    "slot_12": {
      "hex": "#3A3A3A",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#4B3A2D",
      "ids": [
        "border.strong"
      ]
    },
    "slot_14": {
      "hex": "#DAD2C0",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_15": {
      "hex": "#EEE4D9",
      "ids": [
        "border.faint"
      ]
    },
    "slot_16": {
      "hex": "#0F0F0F",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_17": {
      "hex": "#F6E0A3",
      "ids": [
        "shadow.highlight.sm"
      ]
    },
    "slot_18": {
      "hex": "#E8D56A",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_19": {
      "hex": "#F6C96A",
      "ids": [
        "logo.accent"
      ]
    },
    "slot_20": {
      "hex": "#8B5E2B",
      "ids": [
        "background.element2"
      ]
    },
    "slot_21": {
      "hex": "#F6C76A",
      "ids": [
        "background.particle"
      ]
    },
    "slot_22": {
      "hex": "#5A5A5A",
      "ids": [
        "text.caption"
      ]
    },
    "slot_23": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "surface.card"
      ]
    },
    "slot_24": {
      "hex": "#D96C2B",
      "ids": [
        "text.brand",
        "text.highlight",
        "button.primary.bg",
        "border.brand",
        "border.highlight",
        "logo.main",
        "background.element1"
      ]
    },
    "slot_25": {
      "hex": "#F6F0E0",
      "ids": [
        "surface.page"
      ]
    },
    "slot_26": {
      "hex": "#F0E6D8",
      "ids": [
        "surface.base",
        "background.base"
      ]
    },
    "slot_27": {
      "hex": "#F9F3E6",
      "ids": [
        "input.bg"
      ]
    },
    "slot_28": {
      "hex": "#DED4C0",
      "ids": [
        "input.border"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "12px",
    "radius.card": "16px",
    "radius.input": "12px",
    "radius.subcard": "14px"
  },
  "fonts": {
    "font.title": "Playfair Display",
    "font.headline": "Montserrat",
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
  "COMMUNITY_PAGE.subtitle": "We're forging a desert haven where developers, creators, and AI enthusiasts bloom together.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our sunlit caravan for chats and support.",
  "COMMUNITY_PAGE.githubSubtitle": "Collaborate on open-source desert-projects and contribute code.",
  "COMMUNITY_PAGE.supportersSubtitle": "We're grateful to our desert-supporters for their contributions to the platform.",
  "HELLO_PAGE.heroTitle": "An AI platform for desert developers."
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
        opacity: 0.62;
        z-index: 2;
        letter-spacing: 0.05em;
        user-select: none;
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
        renderer = new THREE.WebGLRenderer({
          canvas: document.getElementById('bg-canvas'),
          antialias: true,
          alpha: false
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        resizeRenderer();
      }

      function resizeRenderer() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);

        // Camera floats slightly above, wide view
        camera = new THREE.PerspectiveCamera(38, window.innerWidth/window.innerHeight, 0.1, 100);
        camera.position.set(0, 2.1, 7.8);
        camera.lookAt(0,0,0);
      }

      function createOrganicElements() {
        // ---- Filament network (branching, gently glowing lines) ----
        // Build a few organic mycelium filaments that branch
        const filamentMaterial = new THREE.LineBasicMaterial({
          color: COLORS.filaments,
          transparent: true,
          opacity: 0.38,
          linewidth: 1.4, // ignored in most browsers, style at canvas level
          premultipliedAlpha: true
        });

        // 5 filaments, each generated as pseudo-3D branches
        for (let f=0; f<5; f++) {
          let points = [new THREE.Vector3(
            THREE.MathUtils.randFloat(-3.2, 3.2),
            THREE.MathUtils.randFloat(-1.3, 2.5),
            THREE.MathUtils.randFloat(-1.5, 2)
          )];
          let numBranches = THREE.MathUtils.randInt(7,13);
          for (let b=1; b<=numBranches; b++) {
            const prev = points[points.length-1];
            // Subtle 3D random walk, biasing to branch out horizontally
            points.push(new THREE.Vector3(
              prev.x + THREE.MathUtils.randFloat(-1.0,1.0),
              prev.y + THREE.MathUtils.randFloat(-0.15,0.25),
              prev.z + THREE.MathUtils.randFloat(-0.6,0.6)
            ));
          }
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geo, filamentMaterial.clone());
          filaments.push(line);
          scene.add(line);
        }

        // ---- Node spheres (synapse-like junctions) ----
        const nodeGeometry = new THREE.SphereGeometry(0.18, 12, 7);
        const nodeMaterial = new THREE.MeshBasicMaterial({
          color: COLORS.nodes,
          transparent: true,
          opacity: 0.6,
          premultipliedAlpha: true
        });

        // Place nodes at some filament branch ends
        for (let i=0; i<filaments.length; i++) {
          const geo = filaments[i].geometry;
          const pts = geo.attributes.position;
          // Node at the end
          let endPos = new THREE.Vector3(
            pts.getX(pts.count-1),
            pts.getY(pts.count-1),
            pts.getZ(pts.count-1)
          );
          let node = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
          node.position.copy(endPos);
          node.userData.base = endPos.clone();
          nodes.push(node);
          scene.add(node);
          // And a few sprinkled randomly elsewhere
          for (let n=0; n<2; n++) {
            let idx = THREE.MathUtils.randInt(2, pts.count-2);
            let pos = new THREE.Vector3(
              pts.getX(idx),
              pts.getY(idx),
              pts.getZ(idx)
            );
            let extra = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
            extra.position.copy(pos);
            extra.userData.base = pos.clone();
            nodes.push(extra);
            scene.add(extra);
          }
        }

        // ---- Floating spores (small, softly glowing particles) ----
        const sporeMaterial = new THREE.MeshBasicMaterial({
          color: COLORS.particles,
          transparent: true,
          opacity: 0.43,
          premultipliedAlpha: true
        });

        const sporeGeometry = new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.06,0.12), 8, 5);

        for (let s=0; s<30; s++) {
          let spore = new THREE.Mesh(
            sporeGeometry,
            sporeMaterial.clone()
          );
          // Float in central area
          spore.position.set(
            THREE.MathUtils.randFloat(-4.5,4.5),
            THREE.MathUtils.randFloat(-2.1,2.7),
            THREE.MathUtils.randFloat(-2.5,2.5)
          );
          // Slight different radius for spores for variation
          spore.scale.setScalar(THREE.MathUtils.randFloat(0.7, 1.4));
          // Store base position for drift
          spore.userData.base = spore.position.clone();
          spore.userData.phase = THREE.MathUtils.randFloat(0,Math.PI*2);
          spores.push(spore);
          scene.add(spore);
        }
      }

      // Simple camera drift and node pulse
      let clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);

        if (prefersReducedMotion) {
          renderer.render(scene, camera);
          return;
        }

        let t = clock.getElapsedTime();

        // Subtle camera drifting and parallax
        camera.position.x = Math.sin(t/19) * 0.36;
        camera.position.y = 2.1 + Math.sin(t/33) * 0.22;
        camera.position.z = 7.8 + Math.cos(t/21) * 0.22;
        camera.lookAt(0,0,0);

        // Gentle filament opacity breathing effect
        for (let f=0; f<filaments.length; f++) {
          let mat = filaments[f].material;
          mat.opacity = 0.32 + Math.sin(t/3 + f)*0.045;
        }

        // Node pulse (synapse junctions gently breathing)
        for (let i=0; i<nodes.length; i++) {
          let node = nodes[i];
          let base = node.userData.base;
          let phase = t/2 + i*0.6;
          let pulse = 1 + Math.sin(phase)*0.10;
          node.position.set(
            base.x,
            base.y + Math.sin(phase)*0.09,
            base.z
          );
          node.scale.setScalar(pulse);
        }

        // Spore drift, vertical only, each with its own phase
        for (let i=0; i<spores.length; i++) {
          let spore = spores[i];
          let base = spore.userData.base;
          let drift = Math.sin(t/6 + spore.userData.phase) * 0.22 + Math.cos(t/5 + i)*0.07;
          spore.position.set(base.x, base.y + drift, base.z);
        }

        renderer.render(scene, camera);
      }

      function checkReducedMotion() {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        prefersReducedMotion = mq.matches;
        // Optionally listen for change
        mq.addEventListener?.('change', e => {
          prefersReducedMotion = e.matches;
        });
      }

      function onResize() { resizeRenderer(); }

      // --- Init ---
      checkReducedMotion();
      initScene();
      createOrganicElements();
      initRenderer();
      window.addEventListener('resize', onResize);
      animate();
    </script>
  </body>
</html>`;
