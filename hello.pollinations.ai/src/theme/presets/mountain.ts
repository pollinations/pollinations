import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const MountainTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#FFFFFF",
      "ids": [
        "text.primary",
        "button.hover.overlay",
        "button.active.overlay"
      ]
    },
    "slot_1": {
      "hex": "#E6ECF7",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#1E2A50",
      "ids": [
        "input.bg"
      ]
    },
    "slot_3": {
      "hex": "#2A3A68",
      "ids": [
        "input.border"
      ]
    },
    "slot_4": {
      "hex": "#6B7EA6",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_5": {
      "hex": "#3A5BA8",
      "ids": [
        "button.primary.bg"
      ]
    },
    "slot_6": {
      "hex": "#2C4A82",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_7": {
      "hex": "#2E3A56",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_8": {
      "hex": "#3A4C72",
      "ids": [
        "button.secondary.border",
        "border.subtle"
      ]
    },
    "slot_9": {
      "hex": "#2A3450",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_10": {
      "hex": "#8AB4FF",
      "ids": [
        "button.focus.ring"
      ]
    },
    "slot_11": {
      "hex": "#4ADE80",
      "ids": [
        "indicator.image"
      ]
    },
    "slot_12": {
      "hex": "#B8C6DA",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#E0F1FF",
      "ids": [
        "indicator.text"
      ]
    },
    "slot_14": {
      "hex": "#F472B6",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_15": {
      "hex": "#1E2A3A",
      "ids": [
        "border.main"
      ]
    },
    "slot_16": {
      "hex": "#E6EEF7",
      "ids": [
        "border.strong"
      ]
    },
    "slot_17": {
      "hex": "#2B3150",
      "ids": [
        "border.faint"
      ]
    },
    "slot_18": {
      "hex": "#0D1B32",
      "ids": [
        "shadow.brand.sm"
      ]
    },
    "slot_19": {
      "hex": "#162447",
      "ids": [
        "shadow.brand.md"
      ]
    },
    "slot_20": {
      "hex": "#223A6B",
      "ids": [
        "shadow.brand.lg"
      ]
    },
    "slot_21": {
      "hex": "#0B0F15",
      "ids": [
        "shadow.dark.sm"
      ]
    },
    "slot_22": {
      "hex": "#1A2A56",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_23": {
      "hex": "#8A97AD",
      "ids": [
        "text.caption"
      ]
    },
    "slot_24": {
      "hex": "#2C3A52",
      "ids": [
        "shadow.dark.lg"
      ]
    },
    "slot_25": {
      "hex": "#3A4A68",
      "ids": [
        "shadow.dark.xl"
      ]
    },
    "slot_26": {
      "hex": "#1C5FFF",
      "ids": [
        "shadow.highlight.sm"
      ]
    },
    "slot_27": {
      "hex": "#3B82F6",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_28": {
      "hex": "#A6D0FF",
      "ids": [
        "logo.main"
      ]
    },
    "slot_29": {
      "hex": "#F2F5FF",
      "ids": [
        "logo.accent"
      ]
    },
    "slot_30": {
      "hex": "#B4C2D8",
      "ids": [
        "background.element2"
      ]
    },
    "slot_31": {
      "hex": "#F6C400",
      "ids": [
        "background.particle"
      ]
    },
    "slot_32": {
      "hex": "#0A0A0A",
      "ids": [
        "text.inverse"
      ]
    },
    "slot_33": {
      "hex": "#2C5FFF",
      "ids": [
        "text.brand",
        "border.brand",
        "background.element1"
      ]
    },
    "slot_34": {
      "hex": "#F2C94C",
      "ids": [
        "text.highlight",
        "border.highlight"
      ]
    },
    "slot_35": {
      "hex": "#0B1220",
      "ids": [
        "surface.page"
      ]
    },
    "slot_36": {
      "hex": "#162235",
      "ids": [
        "surface.card"
      ]
    },
    "slot_37": {
      "hex": "#0F1A2B",
      "ids": [
        "surface.base",
        "background.base"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "4px",
    "radius.card": "4px",
    "radius.input": "4px",
    "radius.subcard": "4px"
  },
  "fonts": {
    "font.title": "Playfair Display",
    "font.headline": "Montserrat",
    "font.body": "Open Sans"
  },
  "opacity": {
    "opacity.card": "0.95",
    "opacity.overlay": "0.85",
    "opacity.glass": "0.75"
  }
};

export const MountainCssVariables = processTheme(MountainTheme).cssVariables;

// Copy generated with prompt: "mountain"
export const MountainCopy = {
  "APPS_PAGE.subtitle": "Summit-built apps, tools, and experiments—Pollinations-powered. Browse, try, ship.",
  "COMMUNITY_PAGE.subtitle": "We're forging a refuge where developers, makers, and AI enthusiasts converge and bloom together.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our highland circle for chats and support.",
  "COMMUNITY_PAGE.githubSubtitle": "Partner on open-source projects and contribute code.",
  "COMMUNITY_PAGE.supportersSubtitle": "We’re grateful to our supporters for helping the platform climb.",
  "HELLO_PAGE.heroTitle": "Summit AI platform for creative developers."
};

// Background HTML (raw template literal)
export const MountainBackgroundHtml = `<!DOCTYPE html>
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

      // replace these with actual colors at runtime
      const COLORS = {
        sceneBackground: '{{BACKGROUND_BASE}}',
        filaments: '{{BACKGROUND_ELEMENT1}}',
        nodes: '{{BACKGROUND_ELEMENT2}}',
        particles: '{{BACKGROUND_PARTICLE}}'
      };

      let scene, camera, renderer;
      let filaments = [], nodes = [], spores = [];
      let prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let canvas = document.getElementById('bg-canvas');

      function initRenderer() {
        renderer = new THREE.WebGLRenderer({ 
          canvas: canvas, 
          antialias: true, 
          alpha: false 
        });
        renderer.setClearColor(COLORS.sceneBackground, 1);
        resizeRenderer();
        window.addEventListener('resize', resizeRenderer, false);
      }

      function resizeRenderer() {
        const dpr = Math.min(window.devicePixelRatio,2);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setPixelRatio(dpr);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);

        // FOV ~38 to keep shapes soft
        camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
        camera.position.set(0, 0, 60);
      }

      // Organic theme: luminous underground mycelium network
      function createOrganicElements() {
        // Generate filament clusters (mycelium branching)
        const filamentGroup = new THREE.Group();
        const filamentQty = 7 + Math.floor(Math.random() * 3);

        for (let i=0; i<filamentQty; i++) {
          let angle = (i/filamentQty) * Math.PI * 2 + Math.random()*0.4;
          let groupOffset = new THREE.Vector3(
            Math.cos(angle)*16 + (Math.random()-0.5)*8,
            Math.sin(angle)*18 + (Math.random()-0.5)*10,
            (Math.random()-0.5)*8
          );

          // Each branch is 8-14 segments
          let segments = 8 + Math.floor(Math.random()*6);
          let points = [];
          let start = groupOffset;
          let branchAngle = angle + (Math.random()-0.5)*0.5;

          points.push(start.clone());
          for (let s=1; s<=segments; s++) {
            let sway = Math.sin((s/segments) * Math.PI) * 2.5;
            let step = new THREE.Vector3(
              Math.cos(branchAngle)*2.1 + (Math.random()-0.5),
              Math.sin(branchAngle)*2.2 + (Math.random()-0.5),
              (Math.random()-0.5)*1.1
            ).multiplyScalar(s*0.9 + 1.5 + sway*0.13);

            let prev = points[points.length-1];
            let pt = prev.clone().add(step);
            points.push(pt);
          }

          let curve = new THREE.CatmullRomCurve3(points);
          let geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(segments*7));
          let material = new THREE.LineBasicMaterial({
            color: COLORS.filaments,
            opacity: 0.47,
            transparent: true,
            premultipliedAlpha: true
          });
          let line = new THREE.Line(geometry, material);
          filamentGroup.add(line);
          filaments.push({
            line, basePoints: points, curve, groupOffset, branchAngle, sway: Math.random()*0.8+0.8
          });
        }
        scene.add(filamentGroup);

        // Place nodes at random curve points
        for (let i=0; i<filaments.length; i++) {
          const { curve } = filaments[i];
          // Usually at the middle and near ends
          let idxA = Math.floor(curve.getPoints(60).length * (0.28 + Math.random()*0.15));
          let idxB = Math.floor(curve.getPoints(60).length * (0.85 + Math.random()*0.1));
          [idxA, idxB].forEach(idx => {
            let pt = curve.getPoints(60)[idx];
            let sphereGeom = new THREE.SphereGeometry(0.75 + Math.random()*0.9, 12, 12);
            let material = new THREE.MeshBasicMaterial({
              color: COLORS.nodes,
              opacity: 0.58,
              transparent: true,
              premultipliedAlpha: true
            });
            let mesh = new THREE.Mesh(sphereGeom, material);
            mesh.position.copy(pt);
            nodes.push({ mesh, base: pt.clone(), wiggle: Math.random()*2 });
            scene.add(mesh);
          });
        }
        // Add subtle floating spores around cluster
        const sporesQty = prefersReducedMotion ? 10 : 32;
        for (let i=0; i<sporesQty; i++) {
          let phi = Math.random()*Math.PI*2;
          let theta = Math.random()*Math.PI;
          let radius = 18 + Math.random()*16;
          let pos = new THREE.Vector3(
            Math.sin(theta)*Math.cos(phi)*radius + (Math.random()-0.5)*8,
            Math.cos(theta)*radius  + (Math.random()-0.5)*10,
            (Math.random()-0.5)*18
          );
          let geom = new THREE.SphereGeometry(0.17 + Math.random()*0.25, 8, 8);
          let mat = new THREE.MeshBasicMaterial({
            color: COLORS.particles,
            opacity: 0.54 + Math.random()*0.28,
            transparent: true,
            premultipliedAlpha: true,
            blending: THREE.AdditiveBlending
          });
          let mesh = new THREE.Mesh(geom, mat);
          mesh.position.copy(pos);
          mesh.userData = {
            orbitTheta: theta,
            orbitPhi: phi,
            orbitRadius: radius,
            phase: Math.random()*Math.PI*2,
            speed: 0.12 + Math.random()*0.10
          };
          spores.push(mesh);
          scene.add(mesh);
        }
      }

      function animate() {
        requestAnimationFrame(animate);

        if (!prefersReducedMotion) {
          let t = performance.now() * 0.00028;

          // Subtle camera drift
          camera.position.x = Math.sin(t*0.67)*2.7;
          camera.position.y = Math.cos(t*0.44)*2.1;
          camera.lookAt(0,0,0);

          // Animate spores with gentle orbits and phase shimmer
          for (let i = 0; i < spores.length; i++) {
            let s = spores[i], d = s.userData, tt = t*d.speed + d.phase;
            let radius = d.orbitRadius + Math.sin(tt*1.28)*0.65;
            let x = Math.sin(d.orbitTheta+Math.sin(tt)*0.12)*Math.cos(d.orbitPhi+tt*0.12)*radius;
            let y = Math.cos(d.orbitTheta + Math.cos(tt)*0.19)*radius*0.97;
            let z = Math.sin(tt)*1.0 + Math.sin(d.orbitPhi+tt*0.17)*radius*0.24;
            s.position.set(x, y, z);
          }

          // Animate filament nodes with organic pulsation
          for (let i=0; i<nodes.length; i++) {
            let { mesh, base, wiggle } = nodes[i];
            let scale = 1 + Math.sin(t*1.6 + wiggle)*0.14;
            mesh.scale.set(scale, scale, scale);
            mesh.position.copy(base).add(new THREE.Vector3(
              Math.sin(t*1.11 + i)*0.18,
              Math.cos(t*0.97 + i*1.3)*0.14,
              Math.sin(t*0.89+i*0.7)*0.08
            ));
          }
          
          // Animate filaments a little
          for (let i=0; i<filaments.length; i++) {
            let filament = filaments[i];
            let points = [];
            for (let j=0; j<filament.basePoints.length; j++) {
              let pt = filament.basePoints[j].clone();
              // Each branch gets a gentle sinusoidal pulse
              let phase = t*0.8 + j*0.18 + filament.sway*1.2;
              pt.x += Math.sin(phase)*0.09*(j/filament.basePoints.length);
              pt.y += Math.cos(phase+filament.branchAngle)*0.058*(j/filament.basePoints.length);
              points.push(pt);
            }
            // Update geometry with new points
            let newCurve = new THREE.CatmullRomCurve3(points);
            filament.line.geometry.setFromPoints(newCurve.getPoints(points.length*7));
            filament.curve = newCurve;
          }
        }

        renderer.render(scene, camera);
      }

      // If reduced motion, freeze all animation and orbits (but spores shimmer very slightly)
      function applyReducedMotionStatics() {
        // Camera fixed center
        camera.position.set(0, 0, 60);
        camera.lookAt(0,0,0);
        // Spores in a fixed position with just little noise
        for (let s of spores) {
          let d = s.userData;
          let radius = d.orbitRadius + Math.sin(d.phase)*0.23;
          let x = Math.sin(d.orbitTheta)*Math.cos(d.orbitPhi)*radius;
          let y = Math.cos(d.orbitTheta)*radius;
          let z = Math.sin(d.phase)*0.23;
          s.position.set(x, y, z);
        }
        // Nodes set at base
        for (let n of nodes) {
          n.mesh.position.copy(n.base);
        }
      }

      // Setup
      initScene();
      initRenderer();
      createOrganicElements();
      animate();

      if (prefersReducedMotion) {
        applyReducedMotionStatics();
      }
    </script>
  </body>
</html>`;
