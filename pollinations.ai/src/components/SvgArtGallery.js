import React from "react";
import styled from "@emotion/styled";
import SvgArtGenerator from "./SvgArtGenerator";
import Grid from "@mui/material/Grid";

const GalleryContainer = styled.div`
  padding: 2rem;
  width: 100%;
  box-sizing: border-box;
`;

const GalleryItem = styled.div`
  position: relative;
  margin-bottom: 2rem;
`;

const ItemLabel = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  z-index: 1;
`;

const presets = {
  neural: {
    name: "Neural Gardens",
    prompt: "Create an abstract visualization of neural connectivity patterns. Use flowing curves and translucent layers to suggest information flow. Avoid literal neuron representations, focus on dynamic network topology with subtle pulsing animations.",
    temperature: 0.8,
  },
  biomorphic: {
    prompt: "Generate abstract organic patterns inspired by microscopic life. Create flowing, interconnected forms that morph and evolve. Use subtle animations to suggest growth and transformation. Focus on rhythm and continuous motion rather than specific biological structures.",
    temperature: 0.9,
  },
  boids: {
    prompt: "Create abstract flowing fields of motion suggesting collective movement. Use simple geometric elements that respond to invisible forces. Animate smooth transitions and emergent patterns. Focus on the poetry of motion rather than literal representations.",
    temperature: 0.85,
  },
  retrogame: {
    prompt: "Generate abstract geometric compositions inspired by early computer graphics. Use basic shapes, limited color palettes, and precise mathematical patterns. Include subtle animations that suggest computational processes. Focus on pure form rather than game elements.",
    temperature: 0.85,
  },
  solarpunk: {
    prompt: "Create abstract patterns suggesting harmony between organic and technological elements. Use flowing curves intersecting with geometric structures. Animate subtle transitions between natural and artificial forms. Focus on the underlying rhythm rather than literal scenes.",
    temperature: 0.9,
  },
  isometric: {
    prompt: "Generate abstract geometric patterns based on impossible mathematics. Create interlocking shapes that defy conventional perspective. Use subtle animations to shift spatial relationships. Focus on pure geometric relationships rather than architectural elements.",
    temperature: 0.8,
  },
  cellular: {
    prompt: "Visualize abstract cellular automata patterns with artistic interpretation. Create evolving geometric forms that pulse and transform. Use smooth transitions between states. Focus on the mathematical beauty of emergent patterns.",
    temperature: 0.85,
  },
  bauhaus: {
    prompt: "Create pure geometric abstractions inspired by modernist principles. Use primary colors and basic shapes in dynamic compositions. Include subtle rotations and translations. Focus on fundamental visual relationships and rhythm.",
    temperature: 0.7,
  },
  quantum: {
    prompt: "Generate abstract patterns suggesting quantum probability fields. Create flowing, overlapping waves of possibility. Use ethereal animations to suggest quantum uncertainty. Focus on the poetry of probability rather than scientific illustration.",
    temperature: 0.95,
  },
  cosmology: {
    prompt: "Create abstract patterns suggesting cosmic forces and fields. Generate flowing forms that suggest gravitational influence. Use subtle animations to imply vast scales of space and time. Focus on underlying forces rather than celestial objects.",
    temperature: 0.85,
  },
  meditation: {
    prompt: "Generate abstract patterns that induce contemplative states. Create flowing, symmetric forms that pulse with gentle rhythm. Use subtle animations that guide breath and attention. Focus on pure form rather than symbolic elements.",
    temperature: 0.8,
  },
  emergence: {
    prompt: "Create abstract patterns showing complex behavior emerging from simple rules. Generate flowing forms that suggest collective organization. Use subtle animations to reveal underlying patterns. Focus on the beauty of emergence rather than specific systems.",
    temperature: 0.85,
  },
  digitalNature: {
    prompt: "Generate abstract patterns fusing organic and digital aesthetics. Create flowing forms that transition between natural and computational states. Use subtle animations to suggest transformation. Focus on the underlying harmony rather than literal representations.",
    temperature: 0.9,
  },
  hexGrid: {
    name: "Hex Grid Flow",
    prompt: "Create a repeating pattern of hexagons that pulse and flow. Each hexagon should contain similar internal geometric patterns that animate subtly. Use groups of shapes that can be reused across the grid. Add wave-like movements that ripple through the entire pattern.",
    temperature: 0.75
  },
  voronoiTessellation: {
    name: "Voronoi Waves",
    prompt: "Generate an organic Voronoi tessellation pattern. Create cell-like shapes that share common elements and animations. Use groups of geometric patterns that repeat within each cell. Add subtle pulsing movements that spread across the tessellation.",
    temperature: 0.8
  },
  circuitryMesh: {
    name: "Circuit Mesh",
    prompt: "Design a dense pattern of circuit-like paths using repeating geometric elements. Create modular groups of paths that can tile seamlessly. Add subtle data-flow animations that traverse the circuit paths. Use minimal color variations to maintain visual cohesion.",
    temperature: 0.7
  },
  crystalLattice: {
    name: "Crystal Lattice",
    prompt: "Generate a crystalline lattice pattern with repeating geometric nodes. Create groups of angular shapes that interconnect and pulse in unison. Add subtle rotations and scaling animations that propagate through the structure. Focus on symmetry and regular spacing.",
    temperature: 0.75
  },
  waveInterference: {
    name: "Wave Interference",
    prompt: "Create overlapping wave patterns using repeating curved elements. Generate interference-like effects through layered animations. Use groups of similar wave forms that create moiré-like patterns. Add subtle phase shifts in the animations.",
    temperature: 0.85
  },
  fracturedTiles: {
    name: "Fractured Tiles",
    prompt: "Design a pattern of broken geometric tiles that share common elements. Create groups of angular shapes that can be reused across the pattern. Add subtle shifting animations that suggest tectonic movement. Use consistent internal patterns within each tile.",
    temperature: 0.8
  },
  molecularGrid: {
    name: "Molecular Grid",
    prompt: "Generate a grid of molecular-like structures using repeating circular elements. Create groups of interconnected rings that can tile the space. Add subtle orbital animations that maintain pattern consistency. Focus on geometric precision and regular spacing.",
    temperature: 0.75
  },
  flowFields: {
    name: "Flow Fields",
    prompt: "Create a pattern of flowing lines that follow invisible force fields. Generate groups of similar curve patterns that can be repeated. Add subtle animations that suggest fluid dynamics. Use consistent stroke weights and spacing throughout.",
    temperature: 0.85
  },
  recursiveSplits: {
    name: "Recursive Splits",
    prompt: "Design a pattern of recursively splitting shapes that share common elements. Create groups of self-similar forms that can tile the space. Add subtle scaling animations that maintain geometric relationships. Focus on hierarchical organization.",
    temperature: 0.8
  },
  modulatedGrid: {
    name: "Modulated Grid",
    prompt: "Generate a grid pattern with modulated elements that share common features. Create groups of shapes that respond to invisible sine waves. Add subtle undulating animations that affect the entire grid. Use consistent spacing and proportions.",
    temperature: 0.75
  },
  symbioticMesh: {
    name: "Symbiotic Mesh",
    prompt: "Create an organic mesh pattern where elements grow and interact. Generate groups of biomorphic shapes that can be repeated. Add subtle growth animations that maintain pattern cohesion. Focus on interconnected relationships between elements.",
    temperature: 0.85
  },
  dataMatrix: {
    name: "Data Matrix",
    prompt: "Design a matrix of data-like elements using repeating geometric symbols. Create groups of abstract glyphs that can tile the space. Add subtle transformation animations that suggest data flow. Use consistent spacing and alignment.",
    temperature: 0.7
  },
  resonancePatterns: {
    name: "Resonance Patterns",
    prompt: "Generate patterns inspired by resonance phenomena using repeating elements. Create groups of shapes that appear to vibrate in harmony. Add subtle frequency-based animations that maintain pattern stability. Focus on wave-like behaviors.",
    temperature: 0.8
  },
  topographicFlow: {
    name: "Topographic Flow",
    prompt: "Create a pattern of topographic-like contours using repeating curved lines. Generate groups of similar contour patterns that can tile seamlessly. Add subtle flowing animations that suggest terrain changes. Use consistent line weights and spacing.",
    temperature: 0.85
  },
  quantumLattice: {
    name: "Quantum Lattice",
    prompt: "Design a lattice pattern inspired by quantum probability fields. Create groups of wave-like forms that can be repeated. Add subtle phase-shift animations that maintain pattern coherence. Focus on interference-like effects.",
    temperature: 0.9
  },
  mycelialWeb: {
    name: "Mycelial Web",
    prompt: "Generate a pattern of branching, fungal-like networks using repeating elements. Create groups of similar branching structures that can tile the space. Add subtle growth animations that maintain network connectivity. Focus on organic spreading patterns.",
    temperature: 0.85
  },
  diffusionFields: {
    name: "Diffusion Fields",
    prompt: "Create patterns inspired by diffusion processes using repeating elements. Generate groups of gradient-like forms that can tile seamlessly. Add subtle spreading animations that maintain pattern continuity. Focus on smooth transitions between elements.",
    temperature: 0.8
  },
  neuralOscillations: {
    name: "Neural Oscillations",
    prompt: "Design patterns of neural-like oscillations using repeating wave elements. Create groups of synchronized waveforms that can tile the space. Add subtle phase-locked animations that maintain rhythm. Focus on coordinated movements across the pattern.",
    temperature: 0.85
  },
  crystallineFlow: {
    name: "Crystalline Flow",
    prompt: "Generate patterns that combine crystalline structure with fluid movement. Create groups of geometric shapes that flow like liquid. Add subtle morphing animations that preserve pattern structure. Focus on the tension between order and fluidity.",
    temperature: 0.8
  },
  morphogenicField: {
    name: "Morphogenic Field",
    prompt: "Create patterns inspired by morphogenetic fields using repeating cellular elements. Generate groups of similar cell-like forms that can tile seamlessly. Add subtle growth animations that maintain pattern organization. Focus on developmental-like processes.",
    temperature: 0.85
  }
};

const SvgArtGallery = () => {
  return (
    <GalleryContainer>
      <Grid container spacing={3}>
        {Object.entries(presets).map(([key, preset]) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
            <GalleryItem>
              <ItemLabel>{preset.name || key}</ItemLabel>
              <SvgArtGenerator
                width={300}
                height={300}
                prompt={preset.prompt}
                temperature={preset.temperature}
              />
            </GalleryItem>
          </Grid>
        ))}
      </Grid>
    </GalleryContainer>
  );
};

export default SvgArtGallery;
