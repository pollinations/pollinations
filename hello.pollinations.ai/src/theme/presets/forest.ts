import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const ForestTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#0B2A1A",
      "ids": [
        "text.primary"
      ]
    },
    "slot_1": {
      "hex": "#1F3A25",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#1B5F25",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_3": {
      "hex": "#4CAF50",
      "ids": [
        "button.secondary.bg",
        "indicator.image",
        "border.main"
      ]
    },
    "slot_4": {
      "hex": "#3A8E3A",
      "ids": [
        "button.secondary.border"
      ]
    },
    "slot_5": {
      "hex": "#DDE6D5",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_6": {
      "hex": "#000000",
      "ids": [
        "button.hover.overlay"
      ]
    },
    "slot_7": {
      "hex": "#333333",
      "ids": [
        "button.active.overlay"
      ]
    },
    "slot_8": {
      "hex": "#D5F5C3",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_9": {
      "hex": "#1B2A1F",
      "ids": [
        "border.strong"
      ]
    },
    "slot_10": {
      "hex": "#C6D2C3",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_11": {
      "hex": "#E8F0E9",
      "ids": [
        "border.faint"
      ]
    },
    "slot_12": {
      "hex": "#2A4F34",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#1C3D24",
      "ids": [
        "shadow.brand.sm"
      ]
    },
    "slot_14": {
      "hex": "#1A4A30",
      "ids": [
        "shadow.brand.md"
      ]
    },
    "slot_15": {
      "hex": "#14411F",
      "ids": [
        "shadow.brand.lg"
      ]
    },
    "slot_16": {
      "hex": "#0A1E12",
      "ids": [
        "shadow.dark.sm"
      ]
    },
    "slot_17": {
      "hex": "#132817",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_18": {
      "hex": "#1A2F24",
      "ids": [
        "shadow.dark.lg"
      ]
    },
    "slot_19": {
      "hex": "#1E3B2E",
      "ids": [
        "shadow.dark.xl"
      ]
    },
    "slot_20": {
      "hex": "#2C7D32",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_21": {
      "hex": "#8BC34A",
      "ids": [
        "logo.accent"
      ]
    },
    "slot_22": {
      "hex": "#F1F6F0",
      "ids": [
        "background.base"
      ]
    },
    "slot_23": {
      "hex": "#5B7453",
      "ids": [
        "text.caption"
      ]
    },
    "slot_24": {
      "hex": "#4A6E58",
      "ids": [
        "background.element2"
      ]
    },
    "slot_25": {
      "hex": "#A5D6A7",
      "ids": [
        "background.particle"
      ]
    },
    "slot_26": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "surface.card",
        "input.bg",
        "indicator.text"
      ]
    },
    "slot_27": {
      "hex": "#2E7D32",
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
    "slot_28": {
      "hex": "#F6FBF6",
      "ids": [
        "surface.page"
      ]
    },
    "slot_29": {
      "hex": "#EEF4EE",
      "ids": [
        "surface.base"
      ]
    },
    "slot_30": {
      "hex": "#98BFA3",
      "ids": [
        "input.border"
      ]
    },
    "slot_31": {
      "hex": "#7A9489",
      "ids": [
        "input.placeholder"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "12px",
    "radius.card": "14px",
    "radius.input": "8px",
    "radius.subcard": "10px"
  },
  "fonts": {
    "font.title": "Playfair Display",
    "font.headline": "Montserrat",
    "font.body": "Lato"
  },
  "opacity": {
    "opacity.card": "0.95",
    "opacity.overlay": "0.85",
    "opacity.glass": "0.75"
  }
};

export const ForestCssVariables = processTheme(ForestTheme).cssVariables;

// Copy generated with prompt: "forest"
export const ForestCopy = {
  "APPS_PAGE.subtitle": "Forest-crafted apps, tools, experiments—Pollinations-powered. Browse, try, ship.",
  "COMMUNITY_PAGE.subtitle": "We're growing a forest haven where developers, creators, and AI enthusiasts collaborate and bloom.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our sun-dappled glade for chats and support.",
  "COMMUNITY_PAGE.githubSubtitle": "Collaborate on open-source projects and cultivate code.",
  "COMMUNITY_PAGE.supportersSubtitle": "We're grateful to supporters for their care of the platform.",
  "HELLO_PAGE.heroTitle": "An AI grove for creative developers."
};

// Background HTML (raw template literal)
export const ForestBackgroundHtml = `<!DOCTYPE html>
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
        bottom: 18px;
        right: 20px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.84rem;
        color: rgba(245,245,245,0.22);
        padding: 2px 10px;
        letter-spacing: 0.04em;
        background: rgba(8,6,15,0.17);
        border-radius: 12px;
        user-select: none;
        pointer-events: none;
        mix-blend-mode: lighten;
      }
    </style>
  </head>
  <body>
    <canvas id="bg-canvas"></canvas>
    <div class="bg-label">pollinations.ai background</div>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';

      // Theme prompt: luminous underground mycelium network

      // Color tokens to be replaced later
      const COLORS = {
        sceneBackground: '{{BACKGROUND_BASE}}',
        filaments: '{{BACKGROUND_ELEMENT1}}',
        nodes: '{{BACKGROUND_ELEMENT2}}',
        particles: '{{BACKGROUND_PARTICLE}}'
      };

      // Helper for prefers-reduced-motion
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let renderer, scene, camera, myceliumGroup, particleGroup, sizeInfo = {};

      function initRenderer() {
        renderer = new THREE.WebGLRenderer({
          canvas: document.getElementById('bg-canvas'),
          antialias: true,
          alpha: false
        });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        setRendererSize();
      }

      function setRendererSize() {
        sizeInfo.w = window.innerWidth;
        sizeInfo.h = window.innerHeight;
        renderer.setSize(sizeInfo.w, sizeInfo.h, false);
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);

        camera = new THREE.PerspectiveCamera(
          40,
          sizeInfo.w / sizeInfo.h,
          0.1,
          120
        );
        camera.position.set(0, 0, 20);
      }

      function createOrganicElements() {
        myceliumGroup = new THREE.Group();
        particleGroup = new THREE.Group();

        // Create organic filaments: 7-10 branching lines
        const filamentCount = 8;
        for (let i = 0; i < filamentCount; i++) {
          const angle = (2 * Math.PI / filamentCount) * i + Math.random() * 0.3;
          const length = 7 + Math.random() * 4;
          let points = [new THREE.Vector3(
            Math.sin(angle) * 1.7,
            Math.cos(angle) * 1.5,
            0.1 * (Math.random() - 0.5)
          )];
          let branchCount = 13 + Math.floor(Math.random()*6);
          // Build a random organic curve
          for (let j = 1; j < branchCount; j++) {
            points.push(new THREE.Vector3(
              points[j-1].x + (Math.sin(angle + j*0.13) * 0.7 + (Math.random()-0.5)*0.6),
              points[j-1].y + (Math.cos(angle + j*0.11) * 0.7 + (Math.random()-0.5)*0.6),
              points[j-1].z + (Math.random()-0.5)*0.12
            ));
          }
          // Smooth curve
          const curve = new THREE.CatmullRomCurve3(points);
          const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(branchCount * 3));
          const mat = new THREE.LineBasicMaterial({
            color: COLORS.filaments,
            linewidth: 1.65,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
            transparent: true,
            depthWrite: false
          });
          const filament = new THREE.Line(geom, mat);
          myceliumGroup.add(filament);

          // Place nodes at some junctions
          for (let n = 3; n < points.length; n += 4 + Math.floor(Math.random()*3)) {
            const s = 0.24 + Math.random()*0.12;
            const nodeGeom = new THREE.SphereGeometry(s, 12, 12);
            const nodeMat = new THREE.MeshBasicMaterial({
              color: COLORS.nodes,
              opacity: 0.86,
              blending: THREE.AdditiveBlending,
              premultipliedAlpha: true,
              transparent: true,
              depthWrite: false
            });
            nodeMat.emissive = new THREE.Color(COLORS.nodes); // Just a visual hint, not incandescent
            const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
            nodeMesh.position.copy(points[n]);
            myceliumGroup.add(nodeMesh);
          }
        }
        scene.add(myceliumGroup);

        // Particles: floating 'spores'
        const spores = 26;
        for (let i = 0; i < spores; i++) {
          const pgeom = new THREE.SphereGeometry(0.10 + Math.random() * 0.12, 8, 8);
          const pmat = new THREE.MeshBasicMaterial({
            color: COLORS.particles,
            opacity: 0.40 + Math.random() * 0.4,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
            transparent: true,
            depthWrite: false
          });
          const spore = new THREE.Mesh(pgeom, pmat);
          const a0 = Math.random() * Math.PI * 2;
          const rad = 5.2 + Math.random()*7.5;
          spore.userData = {
            basePos: new THREE.Vector3(
              Math.cos(a0) * rad,
              Math.sin(a0) * rad * 0.55 + (Math.random()-0.5)*1.8,
              (Math.random()-0.5) * 2.1
            ),
            driftSpeed: 0.22 + Math.random()*0.16,
            driftOffset: Math.random()*133
          };
          spore.position.copy(spore.userData.basePos);
          particleGroup.add(spore);
        }
        scene.add(particleGroup);
      }

      // For gentle parallax: track mouse movement
      let mouseX = 0, mouseY = 0;
      function onPointerMove(e) {
        const x = (e.clientX / sizeInfo.w) * 2 - 1;
        const y = (e.clientY / sizeInfo.h) * 2 - 1;
        mouseX = x * 0.2;
        mouseY = y * 0.13;
      }
      if (!reduceMotion) window.addEventListener('pointermove', onPointerMove);

      // Animate loop
      function animate() {
        // Camera subtle drifting/parallax
        if (!reduceMotion) {
          camera.position.x = Math.sin(Date.now()/49000) * 2.1 + mouseX * 3.2;
          camera.position.y = Math.sin(Date.now()/57000) * 1.6 + mouseY * 2.1;
        } else {
          camera.position.x = 0;
          camera.position.y = 0;
        }
        camera.lookAt(0,0,0);

        // Animate spores drifting gently
        if (!reduceMotion) {
          particleGroup.children.forEach(spore => {
            const t = (Date.now() * 0.00013 * spore.userData.driftSpeed) + spore.userData.driftOffset;
            // Circular/elliptical gentle drift
            spore.position.x = spore.userData.basePos.x + Math.cos(t) * 0.55 + Math.sin(t*0.6) * 0.22;
            spore.position.y = spore.userData.basePos.y + Math.sin(t*1.1) * 0.40;
            spore.position.z = spore.userData.basePos.z + Math.cos(t*0.67) * 0.28;
          });
        }

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      function onWindowResize() {
        setRendererSize();
        camera.aspect = sizeInfo.w / sizeInfo.h;
        camera.updateProjectionMatrix();
      }
      window.addEventListener('resize', onWindowResize);

      // Bootstrap
      setRendererSize();
      initRenderer();
      initScene();
      createOrganicElements();
      animate();

    </script>
  </body>
</html>`;
