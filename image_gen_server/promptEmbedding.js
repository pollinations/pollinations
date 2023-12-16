// File: calculate_embeddings.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';

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
        console.log("calculating embeddings for new prompts", newPrompts);
        const response = await fetch(embeddingsServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompts: newPrompts })
        });
        const data = await response.json()
        const embeds = data.embeddings;
        const aesthetics = data.aesthetics_scores;
        newPrompts.forEach((prompt, index) => {
            embeddings[prompt] = { 
                embedding: embeds[index],
                aesthetic_score: aesthetics[index]
            };
        });

        if (saveToFile) {
            fs.writeFileSync(embeddingsFilePath, JSON.stringify(embeddings));
        }
    }

    return prompts.map(prompt => embeddings[prompt]);
}

// Function to find the closest embeddings with unique templates and reweighting based on usage count
function findClosestEmbeddings(embeddings, newEmbedding, usageCounts, n = 30) {
    let distances = embeddings.map((embedding, index) => {
        const distance = euclideanDistance(embedding.embedding, newEmbedding);
        const adjustedDistance = distance * (1 + (usageCounts[index] || 0));
        return { index, adjustedDistance };
    });

    // // Sort by adjusted distance
    // distances = _.sortBy(distances, 'adjustedDistance');

    // // Filter out to get unique templates
    // const uniqueTemplates = new Set();
    // const uniqueEmbeddings = distances.filter(d => {
    //     const template = embeddings[d.index].template;
    //     const isUnique = !uniqueTemplates.has(template);
    //     if (isUnique) {
    //         uniqueTemplates.add(template);
    //     }
    //     return isUnique;
    // });
    // console.log("uniqueEmbeddings", uniqueEmbeddings);
    // Return the indices of the unique embeddings, up to n
    const result = distances.slice(0, n).map(d => d.index);
    return result;
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

        const closestIndices = findClosestEmbeddings(embeddings, newEmbedding[0].embedding, usageCounts);
        const closestPrompts = closestIndices.map(index => PROMPTS[index]);

        const substitutedPromptsNotUnique = closestPrompts.map(closestPrompt => applyTemplate(prompt, closestPrompt.template));

        // Filter out to get unique prompts. maintain order
        // also no more than 5
        const uniquePromps = new Set();
        const substitutedPrompts = substitutedPromptsNotUnique.filter(prompt => {
            const isUnique = !uniquePromps.has(prompt);
            if (isUnique) {
                uniquePromps.add(prompt);
            }
            return isUnique;
        }).slice(0, 3);

        const aestheticScores = await calculateEmbeddings(substitutedPrompts, false).then(embeddings => embeddings.map(embedding => embedding.aesthetic_score));
        console.log("aestheticScores", aestheticScores);
        const maxScoreIndex = aestheticScores.indexOf(Math.max(...aestheticScores));
        const template = closestPrompts[maxScoreIndex].template;

        // Increase the usage count for the selected embedding
        usageCounts[closestIndices[maxScoreIndex]] = (usageCounts[closestIndices[maxScoreIndex]] || 0) + 1;

        return applyTemplate(prompt, template);
    } catch (e) {
        console.error("error", e)
        return prompt;
    }
};

let embeddings = null;
let usageCounts = []; // Array to keep track of how many times each embedding has been used
function applyTemplate(prompt, template) {
    return prompt + ". " + prompt + ". " + template.replace("{prompt}", "") + "." + prompt;
}

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
