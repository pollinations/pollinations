// File: calculate_embeddings.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

//dotenv
import dotenv from 'dotenv';
import awaitSleep from 'await-sleep';
import { prompts as PROMPTS } from './prompts.js';
dotenv.config();

// Embeddings file path
const embeddingsFilePath = "./embeddings.json";

// Function to calculate embeddings using a local server
async function calculateEmbeddings(prompts, saveToFile = true) {
    const embeddingsServerUrl = 'http://127.0.0.1:5555/embeddings';
    let embeddings = {};

    if (fs.existsSync(embeddingsFilePath)) {
        embeddings = JSON.parse(fs.readFileSync(embeddingsFilePath));
    }

    const newPrompts = prompts.filter(prompt => !embeddings[prompt]);
    if (newPrompts.length > 0) {
        console.log("calculating embeddings for new prompts");
        const response = await fetch(embeddingsServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompts: newPrompts })
        });
        const data = await response.json();
        newPrompts.forEach((prompt, index) => {
            embeddings[prompt] = data[index];
        });

        if (saveToFile) {
            fs.writeFileSync(embeddingsFilePath, JSON.stringify(embeddings));
        }
    }

    return prompts.map(prompt => embeddings[prompt]);
}

// Function to find the closest embedding with reweighting based on usage count
function findClosestEmbedding(embeddings, newEmbedding, usageCounts) {
    let closestIndex = -1;
    let minDistance = Infinity;

    embeddings.forEach((embedding, index) => {
        const distance = euclideanDistance(embedding, newEmbedding);
        const adjustedDistance = distance * (1 + (usageCounts[index] || 0));
        if (adjustedDistance < minDistance) {
            minDistance = adjustedDistance;
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

    while (!embeddings) {
        await awaitSleep(100);
    }
    
    // Example usage: Find the closest embedding
    try {
        const newEmbedding = await calculateEmbeddings([prompt], false);

        const closestIndex = findClosestEmbedding(embeddings, newEmbedding[0], usageCounts);
        usageCounts[closestIndex] = (usageCounts[closestIndex] || 0) + 1;
        console.log(`Closest prompt:`, PROMPTS[closestIndex]);
        return prompt + ". " + prompt + ". " + PROMPTS[closestIndex].template.replace("{prompt}", "");
    } catch (e) {
        console.error("error", e)
        return prompt;
    }
};

let embeddings = null;
let usageCounts = []; // Array to keep track of how many times each embedding has been used
async function optionallyCalculateEmbeddings() {
    if (embeddings) {
        return;
    }
    const uniquePrompts = PROMPTS.map(prompt => prompt.searchPrompt);
    embeddings = await calculateEmbeddings(uniquePrompts);
    usageCounts = new Array(embeddings.length).fill(0); // Initialize usage counts
}

optionallyCalculateEmbeddings();

// getClosesPrompt("romantic couple").then(console.log);
// getClosesPrompt("pikachu").then(console.log);

// getClosesPrompt("schematic of dolphin").then(console.log);
