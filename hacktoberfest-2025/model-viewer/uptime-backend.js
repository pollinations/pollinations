import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(process.cwd(), 'uptime-data.json');

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage with file persistence
let uptimeData = {};

// Load data from file
async function loadData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        uptimeData = JSON.parse(data);
        console.log(`Loaded uptime data for ${Object.keys(uptimeData).length} models`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error loading data:', error);
        }
    }
}

// Save data to file
async function saveData() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(uptimeData, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Validate model name to prevent prototype pollution
function validateModelName(name) {
    if (!name || typeof name !== 'string') return false;
    if (['__proto__', 'constructor', 'prototype'].includes(name)) return false;
    return true;
}

// Get all uptime data
app.get('/api/uptime', (req, res) => {
    res.json(uptimeData);
});

// Get uptime for specific model
app.get('/api/uptime/:modelName', (req, res) => {
    const { modelName } = req.params;
    
    if (!validateModelName(modelName)) {
        return res.status(400).json({ error: 'Invalid model name' });
    }
    
    const data = uptimeData[modelName];
    if (!data) {
        return res.status(404).json({ error: 'Model not found' });
    }
    
    // Calculate uptime percentage
    const upCount = data.history.filter(h => h.status === 'up').length;
    const percentage = data.history.length > 0 
        ? Math.round((upCount / data.history.length) * 100) 
        : null;
    
    res.json({
        model: modelName,
        ...data,
        uptimePercentage: percentage
    });
});

// Record uptime check
app.post('/api/uptime/:modelName', async (req, res) => {
    const { modelName } = req.params;
    const { isUp, type = 'text' } = req.body;
    
    if (!validateModelName(modelName)) {
        return res.status(400).json({ error: 'Invalid model name' });
    }
    
    if (typeof isUp !== 'boolean') {
        return res.status(400).json({ error: 'isUp must be a boolean' });
    }
    
    // Initialize if doesn't exist
    if (!uptimeData[modelName]) {
        uptimeData[modelName] = {
            history: [],
            lastCheck: null,
            currentStatus: 'unknown',
            type
        };
    }
    
    const timestamp = Date.now();
    const entry = {
        timestamp,
        status: isUp ? 'up' : 'down'
    };
    
    uptimeData[modelName].history.push(entry);
    uptimeData[modelName].lastCheck = timestamp;
    uptimeData[modelName].currentStatus = isUp ? 'online' : 'offline';
    uptimeData[modelName].type = type;
    
    // Keep last 288 entries (24 hours at 5-min intervals)
    if (uptimeData[modelName].history.length > 288) {
        uptimeData[modelName].history = uptimeData[modelName].history.slice(-288);
    }
    
    await saveData();
    
    res.json({ success: true, model: modelName, status: isUp ? 'up' : 'down' });
});

// Fetch models from the API and check their uptime
async function checkAllModels() {
    try {
        // Fetch text models
        const textResponse = await fetch('https://text.pollinations.ai/models');
        const textModels = await textResponse.json();
        
        // Fetch image models
        const imageResponse = await fetch('https://image.pollinations.ai/about');
        const imageModels = await imageResponse.json();
        
        // Check text models
        for (const model of textModels) {
            const isUp = textModels.some(m => m.name === model.name);
            await recordCheck(model.name, isUp, 'text');
        }
        
        // Check image models
        for (const model of imageModels) {
            try {
                const checkResponse = await fetch(
                    `https://image.pollinations.ai/prompt/test?model=${model.name}&width=64&height=64&nologo=true`,
                    { method: 'HEAD' }
                );
                await recordCheck(model.name, checkResponse.ok, 'image');
            } catch (error) {
                await recordCheck(model.name, false, 'image');
            }
        }
        
        console.log(`Checked ${textModels.length} text models and ${imageModels.length} image models`);
    } catch (error) {
        console.error('Error checking models:', error);
    }
}

// Record check helper
async function recordCheck(modelName, isUp, type) {
    if (!validateModelName(modelName)) return;
    
    if (!uptimeData[modelName]) {
        uptimeData[modelName] = {
            history: [],
            lastCheck: null,
            currentStatus: 'unknown',
            type
        };
    }
    
    const timestamp = Date.now();
    uptimeData[modelName].history.push({
        timestamp,
        status: isUp ? 'up' : 'down'
    });
    uptimeData[modelName].lastCheck = timestamp;
    uptimeData[modelName].currentStatus = isUp ? 'online' : 'offline';
    
    if (uptimeData[modelName].history.length > 288) {
        uptimeData[modelName].history = uptimeData[modelName].history.slice(-288);
    }
}

// Initialize
(async () => {
    await loadData();
    
    // Check models immediately
    await checkAllModels();
    
    // Check every 5 minutes
    setInterval(checkAllModels, 5 * 60 * 1000);
    
    // Save every 5 minutes
    setInterval(saveData, 5 * 60 * 1000);
    
    app.listen(PORT, () => {
        console.log(`Uptime monitor backend running on port ${PORT}`);
    });
})();
