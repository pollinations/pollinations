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
"concept art {prompt} . digital artwork, illustrative, painterly, matte painting, highly detailed",
"breathtaking {prompt} . award-winning, professional, highly detailed",
"ethereal fantasy concept art of  {prompt} . magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy",
"isometric style {prompt} . vibrant, beautiful, crisp, detailed, ultra detailed, intricate",
"line art drawing {prompt} . professional, sleek, modern, minimalist, graphic, line art, vector graphics",
"low-poly style {prompt} . low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition",
"neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern",
"origami style {prompt} . paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition",
"cinematic photo {prompt} . 35mm photograph, film, bokeh, professional, 4k, highly detailed",
"pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics","texture {prompt} top down close-up",
"cinematic still {prompt} . emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, epic, gorgeous, film grain, grainy",
"cinematic photo {prompt} . 35mm photograph, film, bokeh, professional, 4k, highly detailed",
"anime artwork {prompt} . anime style, key visual, vibrant, studio anime,  highly detailed",
"manga style {prompt} . vibrant, high-energy, detailed, iconic, Japanese comic style",
"concept art {prompt} . digital artwork, illustrative, painterly, matte painting, highly detailed",
"pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
"ethereal fantasy concept art of  {prompt} . magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy",
"neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern, magenta highlights, dark purple shadows, high contrast, cinematic, ultra detailed, intricate, professional",
"professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting"];
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

// Function to save embeddings to a file
function saveEmbeddings(embeddings) {
    fs.writeFileSync(embeddingsFilePath, JSON.stringify(embeddings, null, 2));
}

// Function to load embeddings from a file
function loadEmbeddings() {
    if (fs.existsSync(embeddingsFilePath)) {
        return JSON.parse(fs.readFileSync(embeddingsFilePath));
    }
    return null;
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

    const embeddings = loadEmbeddings();

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
    if (!fs.existsSync(embeddingsFilePath)) {
        embeddings = await calculateEmbeddings(prompts.map(prompt => prompt.replace("{prompt}", "")));
        saveEmbeddings(embeddings);
    }
    embeddings = loadEmbeddings();
}


// getClosesPrompt("a gheisha ghost under a weepign willow").then(console.log);