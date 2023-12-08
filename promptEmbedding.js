// File: calculate_embeddings.js
// const fetch = require('node-fetch');
// const fs = require('fs');
// const path = require('path');
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

//dotenv
import dotenv from 'dotenv';
dotenv.config();

const prompts = [
"professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
"analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage",
"anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
"cinematic {prompt} . shallow depth of field, vignette, highly detailed, high budget, bokeh, moody, epic, gorgeous, film grain, grainy",
"comic {prompt} . graphic illustration, comic art, graphic novel art, vibrant, highly detailed",
"play-doh style {prompt} . sculpture, clay art, centered composition, Claymation",
"breathtaking {prompt} . award-winning, professional, highly detailed",
"ethereal fantasy concept art of  {prompt} . magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy",
"isometric style {prompt} . vibrant, beautiful, crisp, detailed, ultra detailed, intricate",
"line art drawing {prompt} . professional, sleek, modern, minimalist, graphic, line art, vector graphics",
"low-poly style {prompt} . low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition",
"neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern",
"origami style {prompt} . paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition",
"pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
"texture {prompt} top down close-up",
"cinematic still {prompt} . emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, gorgeous, film grain, grainy",
"cinematic photo {prompt} . 35mm photograph, film, bokeh, professional, 4k, highly detailed",
"anime artwork {prompt} . anime style, key visual, vibrant, studio anime,  highly detailed",
"manga style {prompt} . vibrant, high-energy, detailed, iconic, Japanese comic style",
"concept art {prompt} . digital artwork, illustrative, painterly, matte painting, highly detailed",
"pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
"professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
"glitch art portrait {prompt} . digital distortion, VHS overlay, retro cyber effects, pixelated errors",
"HDR urban photography {prompt} . high dynamic range, crisp details, vivid colors, cityscape focus",
"charcoal sketch {prompt} . rough textures, gradations of black and white, smudged shading, realistic",
"psychedelic abstract {prompt} . vibrant swirls, optical illusions, bold colors, reminiscent of 1960s art",
"8mm vintage travel film {prompt} . grainy texture, sepia tones, flickering effect, nostalgic feel",
"digital vector illustration {prompt} . clean lines, flat colors, Adobe Illustrator style, modern graphic",
"macro nature photography {prompt} . extreme close-up, detailed textures, bokeh background, vivid flora or fauna",
"gothic fantasy {prompt} . dark and brooding atmosphere, medieval architecture, mythical creatures",
"art deco poster {prompt} . geometric shapes, gold and metallic accents, elegant fonts, 1920s glamour",
"hand-painted ceramic design {prompt} . glazed textures, intricate patterns, traditional pottery style",
"holographic 3D model {prompt} . futuristic, shimmering rainbow effects, translucent, light-interactive",
"experimental mixed media {prompt} . collage elements, diverse materials, avant-garde, textural contrasts",
    "risograph art print {prompt} . layered colors, grainy texture, limited color palette, retro vibe",
    "minimalist Scandinavian design {prompt} . clean lines, muted colors, functional and modern, natural elements",
    "baroque interior scene {prompt} . opulent, ornate details, dramatic lighting, luxurious",
    "Japanese ink wash painting {prompt} . sumi-e style, brush strokes, monochrome, Zen-like simplicity",
    "graffiti street art {prompt} . bold colors, urban style, spray paint textures, street culture",
    "noir film scene {prompt} . black and white, high contrast, shadowy, 1940s detective film vibe",
    "virtual reality landscape {prompt} . futuristic, immersive, 360-degree view, digital world",
    "bioluminescent underwater scene {prompt} . glowing creatures, deep sea, mysterious, vibrant colors",
    "medieval manuscript illustration {prompt} . illuminated letters, gold leaf, intricate borders, historical",
    "surreal cosmic landscape {prompt} . otherworldly, starry skies, floating elements, dreamy colors",
    "claymation character design {prompt} . stop-motion style, textured, whimsical, playful",
    "woodblock print nature scene {prompt} . traditional Japanese style, layered, natural patterns",
    "art nouveau architectural design {prompt} . flowing lines, floral motifs, elegant, organic forms",
    "interactive 3D game environment {prompt} . immersive, realistic textures, dynamic lighting, engaging",
    "pop art advertisement {prompt} . bold colors, comic style, 1960s vibe, catchy tagline",
    "ambient mood scene {prompt} . soft lighting, calming colors, tranquil, soothing atmosphere",
    "steampunk gadget design {prompt} . mechanical parts, bronze and copper, Victorian era, intricate gears",
    "Cyberpunk city at night {prompt} . neon lights, futuristic buildings, dystopian, rain-soaked streets"
];
// Embeddings file path
const embeddingsFilePath = "./embeddings.json";



// Function to calculate embeddings using OpenAI API
async function calculateEmbeddings(prompts) {
    const apiKey = process.env.OPENAI_API_KEY;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    return Promise.all(prompts.map(async (prompt) => {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: prompt
            })
        });
        const data = await response.json();
        console.log(data);
        return data.data[0].embedding;
    }));
}

// Function to find the closest embedding
function findClosestEmbedding(embeddings, newEmbedding) {
    let closestIndex = -1;
    let minDistance = Infinity;

    embeddings.forEach((embedding, index) => {
        const distance = euclideanDistance(embedding, newEmbedding);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex;
}

// Euclidean distance calculation
function euclideanDistance(vec1, vec2) {
    return Math.sqrt(vec1.reduce((acc, val, i) => acc + Math.pow(val - vec2[i], 2), 0));
}


// Main function
export const getClosesPrompt = async (prompt) => {

    await optionallyCalculateEmbeddings();

    // Example usage: Find the closest embedding
    const newEmbedding = await calculateEmbeddings([prompt]);
    const closestIndex = findClosestEmbedding(embeddings, newEmbedding[0]);
    // console.log(`Closest prompt index: ${closestIndex}`);
    console.log(`Closest prompt: ${prompts[closestIndex]}`);
    // replace {prompt} with the prompt
    return prompts[closestIndex].replace("{prompt}", prompt);
};

let embeddings = null;
async function optionallyCalculateEmbeddings() {
    if (embeddings) {
        return;
    }
    embeddings = await calculateEmbeddings(prompts.map(prompt => prompt.replace("{prompt}", "")));
}


// getClosesPrompt("sonic the hedgehog game art").then(console.log);