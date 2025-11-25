import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const OceanTheme: LLMThemeResponse = {
  "slots": {
    "slot_0": {
      "hex": "#0B1F3B",
      "ids": [
        "text.primary"
      ]
    },
    "slot_1": {
      "hex": "#1F3A59",
      "ids": [
        "text.secondary"
      ]
    },
    "slot_2": {
      "hex": "#8BA8C9",
      "ids": [
        "input.placeholder"
      ]
    },
    "slot_3": {
      "hex": "#1652B3",
      "ids": [
        "button.primary.border"
      ]
    },
    "slot_4": {
      "hex": "#DDE8FF",
      "ids": [
        "button.secondary.bg"
      ]
    },
    "slot_5": {
      "hex": "#89A5E8",
      "ids": [
        "button.secondary.border"
      ]
    },
    "slot_6": {
      "hex": "#F2F4F8",
      "ids": [
        "button.disabled.bg"
      ]
    },
    "slot_7": {
      "hex": "#E6F0FF",
      "ids": [
        "button.hover.overlay"
      ]
    },
    "slot_8": {
      "hex": "#CFE0FF",
      "ids": [
        "button.active.overlay"
      ]
    },
    "slot_9": {
      "hex": "#4EA8FF",
      "ids": [
        "button.focus.ring"
      ]
    },
    "slot_10": {
      "hex": "#4FC3FF",
      "ids": [
        "indicator.image"
      ]
    },
    "slot_11": {
      "hex": "#0A2540",
      "ids": [
        "indicator.text"
      ]
    },
    "slot_12": {
      "hex": "#2E5D8A",
      "ids": [
        "text.tertiary"
      ]
    },
    "slot_13": {
      "hex": "#1BC9D8",
      "ids": [
        "indicator.audio"
      ]
    },
    "slot_14": {
      "hex": "#3AA0FF",
      "ids": [
        "border.highlight"
      ]
    },
    "slot_15": {
      "hex": "#5B8CC0",
      "ids": [
        "border.main"
      ]
    },
    "slot_16": {
      "hex": "#1A2A5A",
      "ids": [
        "border.strong"
      ]
    },
    "slot_17": {
      "hex": "#C9D8EE",
      "ids": [
        "border.subtle"
      ]
    },
    "slot_18": {
      "hex": "#E9F0FF",
      "ids": [
        "border.faint"
      ]
    },
    "slot_19": {
      "hex": "#1A3A8A",
      "ids": [
        "shadow.brand.sm"
      ]
    },
    "slot_20": {
      "hex": "#173A8A",
      "ids": [
        "shadow.brand.md"
      ]
    },
    "slot_21": {
      "hex": "#102D66",
      "ids": [
        "shadow.brand.lg"
      ]
    },
    "slot_22": {
      "hex": "#0A0A0A",
      "ids": [
        "shadow.dark.sm"
      ]
    },
    "slot_23": {
      "hex": "#4F6A85",
      "ids": [
        "text.caption"
      ]
    },
    "slot_24": {
      "hex": "#141414",
      "ids": [
        "shadow.dark.md"
      ]
    },
    "slot_25": {
      "hex": "#1D1D1D",
      "ids": [
        "shadow.dark.lg"
      ]
    },
    "slot_26": {
      "hex": "#2B2B2B",
      "ids": [
        "shadow.dark.xl"
      ]
    },
    "slot_27": {
      "hex": "#0D7ACC",
      "ids": [
        "shadow.highlight.sm"
      ]
    },
    "slot_28": {
      "hex": "#0A66D0",
      "ids": [
        "shadow.highlight.md"
      ]
    },
    "slot_29": {
      "hex": "#2DE1FF",
      "ids": [
        "logo.accent"
      ]
    },
    "slot_30": {
      "hex": "#2EC4B6",
      "ids": [
        "background.element2"
      ]
    },
    "slot_31": {
      "hex": "#A0D8FF",
      "ids": [
        "background.particle"
      ]
    },
    "slot_32": {
      "hex": "#FFFFFF",
      "ids": [
        "text.inverse",
        "surface.card",
        "input.bg"
      ]
    },
    "slot_33": {
      "hex": "#1F6FEB",
      "ids": [
        "text.brand",
        "button.primary.bg",
        "border.brand",
        "logo.main",
        "background.element1"
      ]
    },
    "slot_34": {
      "hex": "#1FB0FF",
      "ids": [
        "text.highlight"
      ]
    },
    "slot_35": {
      "hex": "#F6FBFF",
      "ids": [
        "surface.page",
        "background.base"
      ]
    },
    "slot_36": {
      "hex": "#ECF5FF",
      "ids": [
        "surface.base"
      ]
    },
    "slot_37": {
      "hex": "#DDE8F4",
      "ids": [
        "input.border"
      ]
    }
  },
  "borderRadius": {
    "radius.button": "14px",
    "radius.card": "16px",
    "radius.input": "12px",
    "radius.subcard": "14px"
  },
  "fonts": {
    "font.title": "Poppins",
    "font.headline": "Montserrat",
    "font.body": "Roboto"
  },
  "opacity": {
    "opacity.card": "0.95",
    "opacity.overlay": "0.85",
    "opacity.glass": "0.75"
  }
};

export const OceanCssVariables = processTheme(OceanTheme).cssVariables;

// Copy generated with prompt: "ocean"
export const OceanCopy = {
  "APPS_PAGE.subtitle": "Pollinations-powered apps, tools, experiments—tide-born. Browse, try, ship.",
  "COMMUNITY_PAGE.subtitle": "We're shaping a harbor where developers, creators, and AI explorers collaborate and bloom together.",
  "COMMUNITY_PAGE.discordSubtitle": "Join our sunlit currents for chats and support.",
  "COMMUNITY_PAGE.githubSubtitle": "Collaborate on open-source ventures and contribute code.",
  "COMMUNITY_PAGE.supportersSubtitle": "We're grateful to supporters for their contributions to the platform, always.",
  "HELLO_PAGE.heroTitle": "An ocean-born AI platform for devs."
};

// Background HTML (raw template literal)
export const OceanBackgroundHtml = `<!DOCTYPE html>
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
          alpha: false // background is handled by scene
        });
        resizeRenderer();
        window.addEventListener('resize', resizeRenderer);
      }

      function resizeRenderer() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w/h;
        camera.updateProjectionMatrix();
      }

      function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.sceneBackground);

        // Camera: Gentle drift, not too close for organic web
        camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0,0,46);
      }

      function createOrganicElements() {
        // Filaments: branching lines like mycelium
        const filamentCount = 18;
        for (let i=0; i < filamentCount; i++) {
          const points = [];
          const angle = (i/filamentCount) * Math.PI * 2;
          const radius = 22 + Math.random()*10;
          let x = Math.cos(angle) * (radius + Math.random()*4);
          let y = Math.sin(angle) * (radius + Math.random()*7);
          let z = (Math.random()-0.5)*6;
          points.push(new THREE.Vector3(x, y, z));

          // Create gentle organic curves: random walk but smoothly linked
          let branches = 6 + Math.floor(Math.random()*5);
          for (let b=1; b<=branches; b++) {
            x += (Math.random()-0.5)*7;
            y += (Math.random()-0.5)*7;
            z += (Math.random()-0.5)*2;
            points.push(new THREE.Vector3(x, y, z));
          }
          // Spline curve for gentle flow
          const curve = new THREE.CatmullRomCurve3(points);
          const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));

          const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
              color: COLORS.filaments,
              transparent: true,
              opacity: 0.42 + Math.random()*0.42
            })
          );
          filaments.push({ obj: line, curve, seed: Math.random()*100, angle });
          scene.add(line);

          // Spawn nodes on some branch ends
          if (i%2===0) {
            let p = points[points.length-1];
            const nodeGeo = new THREE.SphereGeometry(0.85 + Math.random()*0.35, 16, 16);
            const nodeMat = new THREE.MeshBasicMaterial({
              color: COLORS.nodes,
              transparent: true,
              opacity: 0.33
            });
            const mesh = new THREE.Mesh(nodeGeo, nodeMat);
            mesh.position.copy(p);
            nodes.push({ obj: mesh, origin: p.clone(), floatPhase: Math.random()*Math.PI*2 });
            scene.add(mesh);
          }
        }

        // Floating spores / particles
        const sporeCount = 38;
        for (let i=0; i<sporeCount; i++) {
          const phi = Math.random() * Math.PI * 2;
          const theta = Math.acos(Math.random()*2-1);
          const r = 17 + Math.random()*15;
          const pos = new THREE.Vector3(
            Math.sin(theta)*Math.cos(phi)*r,
            Math.sin(theta)*Math.sin(phi)*r,
            Math.cos(theta)*r
          );
          const geo = new THREE.SphereGeometry(0.35+Math.random()*0.42, 10, 10);
          const mat = new THREE.MeshBasicMaterial({
            color: COLORS.particles,
            transparent: true,
            opacity: 0.22 + Math.random()*0.5,
            premultipliedAlpha: true
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(pos);
          scene.add(mesh);
          spores.push({
            obj: mesh,
            driftAxis: new THREE.Vector3(
              Math.random()-0.5,
              Math.random()-0.5,
              Math.random()-0.5
            ).normalize(),
            driftSpeed: 0.004 + Math.random()*0.006,
            floatPhase: Math.random()*6.28
          });
        }
      }

      function animate(time) {
        // Reduce motion if requested
        if (prefersReducedMotion) {
          renderer.render(scene, camera);
          return;
        }
        time /= 1040; // time scale for slow changes

        // Filament gentle undulation
        filaments.forEach(f => {
          // Offset points a tiny bit to simulate living flow
          const cp = f.curve.points;
          for (let i=1; i<cp.length-1; i++) {
            let phase = (time*0.45) + f.angle*0.8 + i*0.13 + f.seed;
            let p = cp[i];
            p.x += Math.sin(phase)*0.035*(i+1);
            p.y += Math.cos(phase*0.5+i*0.35)*0.031;
          }
          f.obj.geometry.setFromPoints( f.curve.getPoints(40) );
        });

        // Node slow pulsing and subtle float
        nodes.forEach(n => {
          let t = time*0.5 + n.floatPhase;
          n.obj.position.set(
            n.origin.x + Math.sin(t)*0.33,
            n.origin.y + Math.cos(t)*0.19,
            n.origin.z + Math.sin(t+0.8)*0.15
          );
          let scale = 1 + Math.sin(t*0.7)*0.11;
          n.obj.scale.set(scale, scale, scale);
        });

        // Spores - gentle drift and bob
        spores.forEach(s => {
          let driftOffset = Math.sin(time*s.driftSpeed + s.floatPhase)*0.7;
          let off = s.driftAxis.clone().multiplyScalar( driftOffset );
          s.obj.position.add( off );
          let scaleBob = 1 + Math.cos(time*0.8 + s.floatPhase)*0.15;
          s.obj.scale.set(scaleBob, scaleBob, scaleBob);
        });

        // Gentle camera parallax based on mouse, but only within a tiny range
        camera.position.x *= 0.97;
        camera.position.y *= 0.97;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      // Mouse-based parallax but minimal
      function setupSubtleParallax() {
        window.addEventListener('mousemove', evt => {
          if (prefersReducedMotion) return;
          const x = (evt.clientX / window.innerWidth - 0.5) * 4;
          const y = (evt.clientY / window.innerHeight - 0.5) * 2;
          camera.position.x = x;
          camera.position.y = y;
        });
      }

      // Prefer reduced motion
      function checkMotionPref() {
        prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }

      function main() {
        checkMotionPref();
        initScene();
        initRenderer();
        createOrganicElements();
        setupSubtleParallax();
        animate();
      }

      main();
    </script>
  </body>
</html>`;
