import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const BeachTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#0B2A66",
            "ids": ["text.primary", "indicator.text"],
        },
        "slot_1": {
            "hex": "#1F3A68",
            "ids": ["text.secondary"],
        },
        "slot_2": {
            "hex": "#B5A17A",
            "ids": ["input.placeholder"],
        },
        "slot_3": {
            "hex": "#4AA3FF",
            "ids": [
                "button.primary.bg",
                "indicator.image",
                "logo.main",
                "background.element1",
            ],
        },
        "slot_4": {
            "hex": "#FFD166",
            "ids": ["button.secondary.bg", "shadow.highlight.sm"],
        },
        "slot_5": {
            "hex": "#E4A200",
            "ids": ["button.secondary.border"],
        },
        "slot_6": {
            "hex": "#F3F5F7",
            "ids": ["button.disabled.bg"],
        },
        "slot_7": {
            "hex": "#000000",
            "ids": ["button.hover.overlay", "shadow.dark.sm"],
        },
        "slot_8": {
            "hex": "#333333",
            "ids": ["button.active.overlay"],
        },
        "slot_9": {
            "hex": "#5B9CFF",
            "ids": ["button.focus.ring"],
        },
        "slot_10": {
            "hex": "#FF7D6C",
            "ids": ["indicator.audio", "background.element2"],
        },
        "slot_11": {
            "hex": "#1E1E1E",
            "ids": ["border.strong"],
        },
        "slot_12": {
            "hex": "#345A82",
            "ids": ["text.tertiary"],
        },
        "slot_13": {
            "hex": "#A0AAB6",
            "ids": ["border.subtle"],
        },
        "slot_14": {
            "hex": "#EDEDED",
            "ids": ["border.faint"],
        },
        "slot_15": {
            "hex": "#1E4A82",
            "ids": ["shadow.brand.md"],
        },
        "slot_16": {
            "hex": "#0E2A66",
            "ids": ["shadow.brand.lg"],
        },
        "slot_17": {
            "hex": "#0F0F0F",
            "ids": ["shadow.dark.md"],
        },
        "slot_18": {
            "hex": "#1A1A1A",
            "ids": ["shadow.dark.lg"],
        },
        "slot_19": {
            "hex": "#2A2A2A",
            "ids": ["shadow.dark.xl"],
        },
        "slot_20": {
            "hex": "#FFC24B",
            "ids": ["shadow.highlight.md"],
        },
        "slot_21": {
            "hex": "#7BDFF6",
            "ids": ["background.particle"],
        },
        "slot_22": {
            "hex": "#7A8C97",
            "ids": ["text.caption"],
        },
        "slot_23": {
            "hex": "#FFFFFF",
            "ids": ["text.inverse", "surface.card", "input.bg"],
        },
        "slot_24": {
            "hex": "#2B6CB0",
            "ids": [
                "text.brand",
                "button.primary.border",
                "border.brand",
                "border.main",
                "shadow.brand.sm",
            ],
        },
        "slot_25": {
            "hex": "#FFB703",
            "ids": ["text.highlight", "border.highlight", "logo.accent"],
        },
        "slot_26": {
            "hex": "#FFF7EC",
            "ids": ["surface.page"],
        },
        "slot_27": {
            "hex": "#FFFDF6",
            "ids": ["surface.base", "background.base"],
        },
        "slot_28": {
            "hex": "#E0CBA0",
            "ids": ["input.border"],
        },
    },
    "borderRadius": {
        "radius.button": "14px",
        "radius.card": "20px",
        "radius.input": "8px",
        "radius.subcard": "12px",
    },
    "fonts": {
        "font.title": "Pacifico",
        "font.headline": "Montserrat",
        "font.body": "Nunito",
    },
    "opacity": {
        "opacity.card": "0.95",
        "opacity.overlay": "0.85",
        "opacity.glass": "0.75",
    },
};

export const BeachCssVariables = processTheme(BeachTheme).cssVariables;

// Copy generated with prompt: "beach"
export const BeachCopy = {
    "APPS_PAGE.title": "Ecosystem",
    "APPS_PAGE.subtitle":
        "Beach-powered: community-built apps and experiments, Pollinations-driven. Browse, try.",
    "COMMUNITY_PAGE.title": "Contribute",
    "COMMUNITY_PAGE.subtitle":
        "We're building a shore-friendly platform where developers, creators, and AI enthusiasts ride wave together.",
    "COMMUNITY_PAGE.newsTitle": "What's New",
    "COMMUNITY_PAGE.discordTitle": "Discord",
    "COMMUNITY_PAGE.discordSubtitle":
        "Join our sandy community for chats and support.",
    "COMMUNITY_PAGE.githubTitle": "GitHub",
    "COMMUNITY_PAGE.githubSubtitle":
        "Collaborate on open-source projects and contribute code.",
    "COMMUNITY_PAGE.supportersTitle": "Supporters",
    "COMMUNITY_PAGE.supportersSubtitle":
        "We're grateful to supporters for riding in and fueling our platform.",
    "DOCS_PAGE.title": "Integrate",
    "HELLO_PAGE.heroTitle": "Gen AI with a coast-friendly touch.",
    "HELLO_PAGE.pollenTitle": "Pollen: One simple credit for Everything",
    "HELLO_PAGE.getPollenTitle": "Fuel your vision: Get Pollen your way",
    "HELLO_PAGE.buyCardTitle": "Simple & Fast: Buy what you need",
    "HELLO_PAGE.sponsorshipCardTitle":
        "Our Investment in You: The Sponsorship Program",
    "HELLO_PAGE.sponsorshipTiersTitle": "Grow With Us: The Sponsorship Tiers",
    "HELLO_PAGE.creativeLaunchpadTitle": "Your Creative Launchpad",
    "HELLO_PAGE.differenceTitle": "The Pollinations Difference",
    "HELLO_PAGE.roadmapTitle": "The Horizon: An Open Creative Economy",
    "HELLO_PAGE.roadmapComingSoonTitle": "Secure Front-End Spending",
    "HELLO_PAGE.roadmapQ1Title": "In-App Purchase",
    "HELLO_PAGE.roadmapOngoingTitle": "Beyond",
    "HELLO_PAGE.ctaTitle": "Ready to Create?",
    "PLAY_PAGE.createTitle": "Create",
    "PLAY_PAGE.watchTitle": "Watch",
};

// Background HTML (base64 encoded to avoid escaping issues)
export const BeachBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Organic Symbiosis Ambient Background</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #000;
      overflow: hidden;
    }
    body {
      width: 100vw;
      height: 100vh;
    }
    #bg-canvas {
      position: absolute;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      display: block;
      z-index: 0;
      pointer-events: none;
      background: transparent;
    }
    .bg-label {
      position: absolute;
      bottom: 16px;
      right: 20px;
      font-family: 'Roboto', sans-serif;
      font-size: 13px;
      color: rgba(255,255,255,0.17);
      background: rgba(0,0,0,0.25);
      padding: 4px 10px;
      border-radius: 7px;
      pointer-events: none;
      user-select: none;
      letter-spacing: 0.08em;
      z-index: 9;
    }
  </style>
  <link href="https://fonts.googleapis.com/css?family=Roboto:400" rel="stylesheet">
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <script type="module">
    import * as THREE from 'https://esm.sh/three';

    // Placeholder tokens to be replaced at runtime
    const COLORS = {
      sceneBackground: '{{BACKGROUND_BASE}}',
      filaments: '{{BACKGROUND_ELEMENT1}}',
      nodes: '{{BACKGROUND_ELEMENT2}}',
      particles: '{{BACKGROUND_PARTICLE}}'
    };

    // Configurable element counts for performance
    const FILAMENT_COUNT = 18;
    const NODE_COUNT = 38;
    const PARTICLE_COUNT = 28;

    let renderer, scene, camera;
    let filaments = [];
    let nodes = [];
    let particles = [];
    let prefersStatic = false;
    let clock = new THREE.Clock();

    // Handle prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prefersStatic = true;
    }

    function initRenderer() {
      renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), antialias: true, alpha: true, premultipliedAlpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0); // transparent for overlay
    }

    function initScene() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(COLORS.sceneBackground);

      camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 130);
      camera.position.set(0, 0, 38);
      // Gentle forward tilt for depth
      camera.lookAt(0, 0, 0);
    }

    function createFilamentMaterial() {
      const mat = new THREE.LineBasicMaterial({
        color: COLORS.filaments,
        transparent: true,
        opacity: 0.75,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true
      });
      return mat;
    }

    function createNodeMaterial() {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.nodes,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true
      });
      return mat;
    }

    function createParticleMaterial() {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.particles,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true
      });
      return mat;
    }

    // Generates branching filaments/mycelium structures
    function createOrganicElements() {
      const filamentMaterial = createFilamentMaterial();
      for (let i = 0; i < FILAMENT_COUNT; i++) {
        const points = [];
        let branchAngle = (Math.PI * 2) * (i / FILAMENT_COUNT) + Math.random() * 0.25;
        let r = 9.6 + Math.random() * 7;
        let cur = new THREE.Vector2(
          Math.cos(branchAngle) * r,
          Math.sin(branchAngle) * r
        );
        points.push(new THREE.Vector3(cur.x, cur.y, -1-0.5*Math.random()));

        // Filament gently curves
        for (let j = 1; j < 32; j++) {
          branchAngle += (Math.random()-0.5)*0.18;
          r += 0.67 + Math.random()*0.23;
          let z = -1-0.5*Math.random();
          points.push(new THREE.Vector3(
            Math.cos(branchAngle) * r,
            Math.sin(branchAngle) * r,
            z
          ));
        }

        let geometry = new THREE.BufferGeometry().setFromPoints(points);
        let line = new THREE.Line(geometry, filamentMaterial);
        scene.add(line);
        filaments.push(line);
      }

      // Softly glowing nodes (junctions)
      let nodeMaterial = createNodeMaterial();
      for (let i = 0; i < NODE_COUNT; i++) {
        let geom = new THREE.SphereGeometry(0.65 + Math.random()*0.38, 12, 10);
        let mesh = new THREE.Mesh(geom, nodeMaterial);
        let angle = (Math.PI*2)*(i/NODE_COUNT) + Math.random();
        let r = 13.6 + Math.random()*8;
        mesh.position.set(
          Math.cos(angle)*r + (Math.random()-0.5)*4,
          Math.sin(angle)*r + (Math.random()-0.5)*3.8,
          -0.7 - Math.random()*2.2
        );
        mesh.userData.baseY = mesh.position.y;
        scene.add(mesh);
        nodes.push(mesh);

        // Some junctions at filament tips
        if (i%8 === 0 && filaments[i%filaments.length]) {
          let lastIdx = filaments[i%filaments.length].geometry.attributes.position.count-1;
          let tipPos = filaments[i%filaments.length].geometry.attributes.position;
          mesh.position.x = tipPos.getX(lastIdx)+Math.random();
          mesh.position.y = tipPos.getY(lastIdx)+Math.random();
          mesh.position.z = tipPos.getZ(lastIdx)-0.2;
        }
      }

      // Floating, drifting spores/particles
      let particleMaterial = createParticleMaterial();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let geom = new THREE.SphereGeometry(0.32 + Math.random()*0.17, 10, 8);
        let mesh = new THREE.Mesh(geom, particleMaterial);
        mesh.position.set(
          (Math.random()-0.5)*20,
          (Math.random()-0.5)*14,
          -2.7 - Math.random()*4.2
        );
        mesh.userData = {
          driftSeed: Math.random()*Math.PI*2,
          driftAxis: Math.random()>0.5 ? 'x':'y'
        };
        scene.add(mesh);
        particles.push(mesh);
      }
    }

    // Applies gentle ambient drift if motion is allowed
    function animate() {
      const elapsed = clock.getElapsedTime();
      if (!prefersStatic) {
        for (let i=0; i<nodes.length; i++) {
          // Soft node pulsing/y drifting
          nodes[i].position.y = nodes[i].userData.baseY + Math.sin(elapsed*0.38 + i)*0.11;
        }
        for (let i=0; i<particles.length; i++) {
          // Spore drift
          let s = particles[i].userData.driftSeed;
          let offset = Math.sin(elapsed*0.17 + s) * 0.32 + Math.cos(elapsed*0.22 + s*2.2)*0.11;
          if (particles[i].userData.driftAxis==='x')
            particles[i].position.x += offset*0.012;
          else
            particles[i].position.y += offset*0.012;
        }
        // Slow parallax with mouse move (if present)
        if (mouseParallax !== null) {
          camera.position.x = mouseParallax.x * 1.3;
          camera.position.y = mouseParallax.y * 0.7;
          camera.lookAt(0,0,0);
        } else {
          camera.position.x *= 0.93;
          camera.position.y *= 0.93;
        }
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    // Gentle parallax effect with mouse movement
    let mouseParallax = null;
    window.addEventListener('mousemove', e => {
      if (!prefersStatic) {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        mouseParallax = { x: x, y: y };
      }
    });

    // Responsive resize
    window.addEventListener('resize', () => {
      if (!renderer || !camera) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });

    function main() {
      initRenderer();
      initScene();
      createOrganicElements();
      animate();
    }

    main();
  </script>
</body>
</html>`;
