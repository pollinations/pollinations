// State Management
let state = {
    currentTab: 'text',
    models: { textModels: [], imageModels: [] },
    filteredModels: [],
    currentFilter: 'all',
    currentTier: 'seed',
    currentSort: 'name',
    currentView: 'grid',
    favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
    darkMode: localStorage.getItem('darkMode') === 'true',
    aiSummaries: {},
    uptimeData: JSON.parse(localStorage.getItem('uptimeData') || '{}')
};

// Pre-generated AI summaries for models
const AI_SUMMARIES = {
    'openai': 'OpenAI GPT-5 Nano is a lightweight, fast language model perfect for quick responses and real-time applications. Best for chatbots, simple Q&A, and rapid prototyping.',
    'openai-fast': 'OpenAI GPT-4.1 Nano offers excellent balance between speed and quality. Ideal for production applications requiring quick turnaround with good accuracy.',
    'openai-large': 'OpenAI GPT-5 Chat is a powerful, full-featured model excelling at complex reasoning and creative tasks. Perfect for detailed content creation and advanced problem-solving.',
    'qwen-coder': 'Qwen 2.5 Coder 32B is specialized for code generation and programming tasks. Excellent for software development, code review, and technical documentation.',
    'mistral': 'Mistral Small 3.2 24B provides efficient multilingual support with strong performance. Great for international applications and diverse content needs.',
    'deepseek': 'DeepSeek V3.1 excels at analytical thinking and complex reasoning tasks. Perfect for research, data analysis, and strategic problem-solving.',
    'openai-audio': 'OpenAI GPT-4o Mini Audio Preview enables multimodal audio conversations. Ideal for voice assistants, audio transcription, and interactive voice applications.',
    'claudyclaude': 'Claude Haiku 4.5 offers balanced performance with ethical AI guardrails. Excellent for customer service, educational content, and safe AI interactions.',
    'openai-reasoning': 'OpenAI o4 Mini specializes in step-by-step logical reasoning. Perfect for mathematical problems, logical puzzles, and structured analysis.',
    'gemini': 'Gemini 2.5 Flash Lite provides fast, efficient multimodal processing. Great for applications needing quick image and text understanding.',
    'gemini-search': 'Gemini 2.5 Flash Lite with Google Search adds real-time web knowledge. Perfect for current events, fact-checking, and up-to-date information needs.',
    'unity': 'Unity Unrestricted Agent offers uncensored, community-driven responses. Best for creative writing, roleplaying, and open-ended conversations.',
    'midijourney': 'MIDIjourney specializes in music generation and audio creativity. Perfect for composers, musicians, and audio content creators.',
    'flux': 'Flux delivers high-quality, artistic image generation with excellent detail. Perfect for digital art, marketing materials, and creative visuals.',
    'kontext': 'Azure Flux Kontext is a versatile, general-purpose image model. Great for diverse image generation needs from photos to illustrations.',
    'turbo': 'Turbo prioritizes speed for rapid image generation. Ideal for quick prototyping, batch processing, and time-sensitive projects.',
    'gptimage': 'GPT Image 1 Mini provides efficient, balanced image creation. Perfect for everyday image needs and content creation.'
};

// Fallback data for models
const fallbackTextModels = [
    {
        name: "openai",
        description: "OpenAI GPT-5 Nano",
        tier: "anonymous",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-fast",
        description: "OpenAI GPT-4.1 Nano",
        tier: "anonymous",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-large",
        description: "OpenAI GPT-5 Chat",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "qwen-coder",
        description: "Qwen 2.5 Coder 32B",
        tier: "anonymous",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "mistral",
        description: "Mistral Small 3.2 24B",
        tier: "anonymous",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "deepseek",
        description: "DeepSeek V3.1",
        tier: "seed",
        reasoning: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-audio",
        description: "OpenAI GPT-4o Mini Audio Preview",
        tier: "seed",
        input_modalities: ["text", "image", "audio"],
        output_modalities: ["audio", "text"],
        tools: true,
    },
    {
        name: "claudyclaude",
        description: "Claude Haiku 4.5",
        tier: "flower",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "openai-reasoning",
        description: "OpenAI o4 Mini",
        tier: "seed",
        reasoning: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "gemini",
        description: "Gemini 2.5 Flash Lite",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "gemini-search",
        description: "Gemini 2.5 Flash Lite with Google Search",
        tier: "seed",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "unity",
        description: "Unity Unrestricted Agent",
        tier: "seed",
        uncensored: true,
        community: true,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: true,
    },
    {
        name: "midijourney",
        description: "MIDIjourney",
        tier: "anonymous",
        community: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
];

const fallbackImageModels = [
    {
        name: "flux",
        description: "Flux - High quality image generation",
        tier: "seed",
        enhance: true,
        maxSideLength: 768,
    },
    {
        name: "kontext",
        description: "Azure Flux Kontext - General purpose model",
        tier: "seed",
        enhance: true,
        maxSideLength: 1024,
    },
    {
        name: "turbo",
        description: "Turbo - Fast image generation",
        tier: "seed",
        enhance: true,
        maxSideLength: 768,
    },
    {
        name: "gptimage",
        description: "GPT Image 1 Mini",
        tier: "seed",
        enhance: false,
        maxSideLength: 1024,
    },
];

// Uptime Checker
class UptimeChecker {
    constructor() {
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.historyLength = 48; // Keep 48 data points (4 hours of history with 5-min intervals)
        this.checking = new Set();
    }

    initializeModelUptime(modelName) {
        if (!state.uptimeData[modelName]) {
            state.uptimeData[modelName] = {
                history: [],
                lastCheck: null,
                currentStatus: 'unknown'
            };
        }
    }

    async checkModelUptime(model, type) {
        const modelName = model.name;
        
        if (this.checking.has(modelName)) {
            return;
        }

        this.checking.add(modelName);
        this.initializeModelUptime(modelName);

        const timestamp = Date.now();
        let isUp = false;

        try {
            if (type === 'text') {
                // Check text model with a simple request
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

                const response = await fetch('https://text.pollinations.ai/models', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const models = await response.json();
                    isUp = models.some(m => m.name === modelName);
                }
            } else if (type === 'image') {
                // Check image model with HEAD request to avoid downloading
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(`https://image.pollinations.ai/prompt/test?model=${modelName}&width=64&height=64&nologo=true`, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                isUp = response.ok;
            }
        } catch (error) {
            console.error(`Uptime check failed for ${modelName}:`, error);
            isUp = false;
        }

        // Update uptime data
        const uptimeEntry = {
            timestamp,
            status: isUp ? 'up' : 'down'
        };

        state.uptimeData[modelName].history.push(uptimeEntry);
        state.uptimeData[modelName].lastCheck = timestamp;
        state.uptimeData[modelName].currentStatus = isUp ? 'online' : 'offline';

        // Keep only the last N entries
        if (state.uptimeData[modelName].history.length > this.historyLength) {
            state.uptimeData[modelName].history = state.uptimeData[modelName].history.slice(-this.historyLength);
        }

        // Save to localStorage
        this.saveUptimeData();
        
        this.checking.delete(modelName);

        return isUp;
    }

    saveUptimeData() {
        try {
            localStorage.setItem('uptimeData', JSON.stringify(state.uptimeData));
        } catch (error) {
            console.error('Failed to save uptime data:', error);
        }
    }

    getUptimePercentage(modelName) {
        const data = state.uptimeData[modelName];
        if (!data || data.history.length === 0) {
            return null;
        }

        const upCount = data.history.filter(entry => entry.status === 'up').length;
        return Math.round((upCount / data.history.length) * 100);
    }

    getUptimeHistory(modelName) {
        const data = state.uptimeData[modelName];
        if (!data) {
            return [];
        }
        return data.history;
    }

    getCurrentStatus(modelName) {
        const data = state.uptimeData[modelName];
        if (!data) {
            return 'unknown';
        }
        return data.currentStatus;
    }

    async checkAllModels() {
        const textModels = state.models.textModels || [];
        const imageModels = state.models.imageModels || [];

        // Check text models
        for (const model of textModels) {
            await this.checkModelUptime(model, 'text');
        }

        // Check image models
        for (const model of imageModels) {
            await this.checkModelUptime(model, 'image');
        }

        // Re-render to update UI
        filterAndRenderModels();
    }

    startPeriodicChecks() {
        // Initial check
        setTimeout(() => this.checkAllModels(), 1000);

        // Set up periodic checks
        setInterval(() => {
            this.checkAllModels();
        }, this.checkInterval);
    }
}

const uptimeChecker = new UptimeChecker();

// API Functions
async function fetchTextModels() {
    try {
        const response = await fetch("https://text.pollinations.ai/models");
        if (!response.ok) throw new Error("Failed to fetch");
        return await response.json();
    } catch (error) {
        console.warn("Using fallback text models", error);
        return fallbackTextModels;
    }
}

async function fetchImageModels() {
    try {
        const response = await fetch("https://image.pollinations.ai/about");
        if (!response.ok) throw new Error("Failed to fetch");
        return await response.json();
    } catch (error) {
        console.warn("Using fallback image models", error);
        return fallbackImageModels;
    }
}

// Load models
async function loadModels() {
    const loading = document.getElementById('loading');
    const modelGrid = document.getElementById('model-grid');
    
    loading.style.display = 'flex';
    modelGrid.style.display = 'none';

    try {
        const [textModels, imageModels] = await Promise.all([
            fetchTextModels(),
            fetchImageModels()
        ]);

        state.models = { textModels, imageModels };
        
        // Update tab counts
        document.getElementById('text-count').textContent = textModels.length;
        document.getElementById('image-count').textContent = imageModels.length;
        
        filterAndRenderModels();

        // Start uptime checking
        uptimeChecker.startPeriodicChecks();
    } catch (error) {
        console.error('Error loading models:', error);
    } finally {
        loading.style.display = 'none';
    }
}

// Filter models
function filterModels(models) {
    let filtered = [...models];
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    // Search filter
    if (search) {
        filtered = filtered.filter(m => 
            m.name.toLowerCase().includes(search) ||
            m.description?.toLowerCase().includes(search)
        );
    }
    
    // Tier filter
    if (state.currentTier) {
        filtered = filtered.filter(m => m.tier === state.currentTier);
    }
    
    // Category filters
    switch (state.currentFilter) {
        case 'tools':
            filtered = filtered.filter(m => m.tools);
            break;
        case 'reasoning':
            filtered = filtered.filter(m => m.reasoning);
            break;
        case 'multimodal':
            filtered = filtered.filter(m => 
                m.input_modalities && m.input_modalities.length > 1
            );
            break;
    }
    
    // Sort
    switch (state.currentSort) {
        case 'name':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'tier':
            const tierOrder = { anonymous: 0, seed: 1, flower: 2, nectar: 3 };
            filtered.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
            break;
        case 'newest':
            filtered.reverse();
            break;
    }
    
    return filtered;
}

// Create uptime bar HTML
function createUptimeBar(modelName) {
    const history = uptimeChecker.getUptimeHistory(modelName);
    const percentage = uptimeChecker.getUptimePercentage(modelName);
    const currentStatus = uptimeChecker.getCurrentStatus(modelName);

    if (history.length === 0) {
        return `
            <div class="uptime-container">
                <div class="uptime-label">
                    <span>Uptime</span>
                    <span class="uptime-status checking">⏳ Checking...</span>
                </div>
                <div class="uptime-bar">
                    ${Array(24).fill('<div class="uptime-segment unknown"></div>').join('')}
                </div>
            </div>
        `;
    }

    const segments = history.slice(-24).map(entry => {
        const statusClass = entry.status === 'up' ? 'up' : 'down';
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleTimeString();
        return `<div class="uptime-segment ${statusClass}" title="${timeStr}: ${entry.status}"></div>`;
    });

    // Fill remaining segments if we don't have 24 yet
    while (segments.length < 24) {
        segments.unshift('<div class="uptime-segment unknown"></div>');
    }

    const statusClass = currentStatus === 'online' ? 'online' : (currentStatus === 'offline' ? 'offline' : 'checking');
    const statusIcon = currentStatus === 'online' ? '🟢' : (currentStatus === 'offline' ? '🔴' : '⏳');

    return `
        <div class="uptime-container">
            <div class="uptime-label">
                <span>Uptime (24h)</span>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    ${percentage !== null ? `<span class="uptime-percentage">${percentage}%</span>` : ''}
                    <span class="uptime-status ${statusClass}">${statusIcon} ${currentStatus}</span>
                </div>
            </div>
            <div class="uptime-bar">
                ${segments.join('')}
            </div>
        </div>
    `;
}

// Render models
function renderModels(models) {
    const modelGrid = document.getElementById('model-grid');
    const noResults = document.getElementById('no-results');
    
    if (models.length === 0) {
        modelGrid.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }
    
    noResults.style.display = 'none';
    modelGrid.style.display = 'grid';
    modelGrid.className = `model-grid ${state.currentView}-view`;
    
    modelGrid.innerHTML = models.map(model => createModelCard(model)).join('');
}

// Create model card HTML
function createModelCard(model) {
    const type = state.currentTab;
    const tierClass = `tier-${model.tier || 'seed'}`;
    const features = getFeatures(model, type);
    const cardId = `model-${model.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const isFavorite = state.favorites.includes(model.name);
    const aiSummary = AI_SUMMARIES[model.name] || '';
    
    const tags = [];
    if (model.reasoning) tags.push('<span class="tag reasoning">⚡ Reasoning</span>');
    if (model.uncensored) tags.push('<span class="tag uncensored">🔓 Uncensored</span>');
    if (model.community) tags.push('<span class="tag community">👥 Community</span>');
    
    return `
        <div class="model-card" id="${cardId}">
            <div class="model-card-header">
                <div>
                    <div class="model-name">${model.name}</div>
                    <div class="tag-container">${tags.join('')}</div>
                </div>
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" 
                        onclick="toggleFavorite('${model.name}')">
                    ${isFavorite ? '❤️' : '🤍'}
                </button>
            </div>
            
            ${createUptimeBar(model.name)}
            
            <div class="model-description">${model.description || "No description available"}</div>
            
            ${aiSummary ? `
                <div class="ai-summary">
                    <div class="ai-summary-label">
                        <span>🤖</span>
                        <span>AI Insight</span>
                    </div>
                    ${aiSummary}
                </div>
            ` : ''}
            
            <div class="tier-badge ${tierClass}">
                ${getTierEmoji(model.tier)} ${getTierLabel(model.tier)}
            </div>
            
            ${features.length > 0 ? `
                <ul class="feature-list">
                    ${features.map(f => `
                        <li class="feature-item">
                            <span class="feature-icon">${f.icon}</span>
                            <span>${f.text}</span>
                        </li>
                    `).join('')}
                </ul>
            ` : ''}
            
            <div class="card-actions">
                <button class="action-btn action-btn-primary tooltip" 
                        onclick="copyModelInfo('${model.name}')">
                    📋 Copy
                    <span class="tooltip-text">Copy model info</span>
                </button>
            </div>
        </div>
    `;
}

// Get features for a model
function getFeatures(model, type) {
    const features = [];
    
    if (type === "text") {
        if (model.input_modalities?.includes("text")) 
            features.push({ icon: "💬", text: "Text Input" });
        if (model.input_modalities?.includes("image")) 
            features.push({ icon: "🖼️", text: "Image Input" });
        if (model.input_modalities?.includes("audio")) 
            features.push({ icon: "🎵", text: "Audio Input" });
        if (model.output_modalities?.includes("text")) 
            features.push({ icon: "📝", text: "Text Output" });
        if (model.output_modalities?.includes("audio")) 
            features.push({ icon: "🔊", text: "Audio Output" });
        if (model.tools) 
            features.push({ icon: "🔧", text: "Tool Support" });
    } else if (type === "image") {
        features.push({ icon: "🎨", text: "Image Generation" });
        if (model.enhance) 
            features.push({ icon: "✨", text: "Enhancement" });
        if (model.maxSideLength) 
            features.push({ icon: "📐", text: `Max: ${model.maxSideLength}px` });
    }
    
    return features;
}

// Get tier emoji and label
function getTierEmoji(tier) {
    const emojiMap = {
        anonymous: "🌱",
        seed: "🌱",
        flower: "🌸",
        nectar: "🍯",
    };
    return emojiMap[tier] || "🌱";
}

function getTierLabel(tier) {
    return tier === "anonymous" ? "FREE" : tier.toUpperCase();
}

// Filter and render
function filterAndRenderModels() {
    const models = state.currentTab === 'text' 
        ? state.models.textModels 
        : state.models.imageModels;
    
    const filtered = filterModels(models);
    state.filteredModels = filtered;
    renderModels(filtered);
}

// Event Handlers
function switchTab(tab) {
    state.currentTab = tab;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('tab-active');
    
    filterAndRenderModels();
}

function setTier(tier) {
    state.currentTier = tier;
    
    document.querySelectorAll('.tier-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tier === tier);
    });
    
    filterAndRenderModels();
}

function setFilter(filter) {
    state.currentFilter = filter;
    filterAndRenderModels();
}

function setSort(sort) {
    state.currentSort = sort;
    filterAndRenderModels();
}

function setView(view) {
    state.currentView = view;
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    filterAndRenderModels();
}

function toggleTheme() {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle('dark-mode', state.darkMode);
    localStorage.setItem('darkMode', state.darkMode);
    
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = state.darkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
}

function toggleFavorite(modelName) {
    const index = state.favorites.indexOf(modelName);
    if (index > -1) {
        state.favorites.splice(index, 1);
    } else {
        state.favorites.push(modelName);
    }
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
    filterAndRenderModels();
}

function showCodeExamples(modelName, type) {
    const modal = document.getElementById('codeModal');
    const content = document.getElementById('codeContent');
    
    const examples = type === 'text' 
        ? getTextModelExamples(modelName)
        : getImageModelExamples(modelName);
    
    content.innerHTML = examples;
    modal.classList.add('show');
}

function getTextModelExamples(modelName) {
    return `
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">JavaScript</span>
                <button class="copy-btn" onclick="copyCode(this, 'js-${modelName}')">Copy</button>
            </div>
            <pre id="js-${modelName}">const response = await fetch('https://text.pollinations.ai/${modelName}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: '${modelName}'
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);</pre>
        </div>
        
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">Python</span>
                <button class="copy-btn" onclick="copyCode(this, 'py-${modelName}')">Copy</button>
            </div>
            <pre id="py-${modelName}">import requests

response = requests.post(
    'https://text.pollinations.ai/${modelName}',
    json={
        'messages': [{'role': 'user', 'content': 'Hello!'}],
        'model': '${modelName}'
    }
)
print(response.json()['choices'][0]['message']['content'])</pre>
        </div>
        
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">cURL</span>
                <button class="copy-btn" onclick="copyCode(this, 'curl-${modelName}')">Copy</button>
            </div>
            <pre id="curl-${modelName}">curl -X POST https://text.pollinations.ai/${modelName} \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "model": "${modelName}"
  }'</pre>
        </div>
    `;
}

function getImageModelExamples(modelName) {
    return `
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">HTML</span>
                <button class="copy-btn" onclick="copyCode(this, 'html-${modelName}')">Copy</button>
            </div>
            <pre id="html-${modelName}">&lt;img src="https://image.pollinations.ai/prompt/your-prompt?model=${modelName}" 
     alt="Generated image" /&gt;</pre>
        </div>
        
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">JavaScript</span>
                <button class="copy-btn" onclick="copyCode(this, 'js-${modelName}')">Copy</button>
            </div>
            <pre id="js-${modelName}">const imageUrl = \`https://image.pollinations.ai/prompt/\${encodeURIComponent(prompt)}?model=${modelName}\`;
document.getElementById('image').src = imageUrl;</pre>
        </div>
        
        <div class="code-block">
            <div class="code-header">
                <span class="code-language">Python</span>
                <button class="copy-btn" onclick="copyCode(this, 'py-${modelName}')">Copy</button>
            </div>
            <pre id="py-${modelName}">import urllib.parse

prompt = "your prompt here"
image_url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?model=${modelName}"
print(image_url)</pre>
        </div>
    `;
}

function copyCode(button, elementId) {
    const code = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(code).then(() => {
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('copied');
        }, 2000);
    });
}

function copyModelInfo(modelName) {
    const allModels = [...state.models.textModels, ...state.models.imageModels];
    const model = allModels.find(m => m.name === modelName);
    
    if (!model) return;
    
    const info = `Model: ${model.name}
Description: ${model.description}
Tier: ${model.tier}
${AI_SUMMARIES[modelName] ? `AI Insight: ${AI_SUMMARIES[modelName]}` : ''}`;
    
    navigator.clipboard.writeText(info).then(() => {
        alert('Model info copied to clipboard!');
    });
}

function closeModal() {
    document.getElementById('codeModal').classList.remove('show');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme
    if (state.darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggle').textContent = '☀️ Light Mode';
    }
    
    // Event listeners
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('searchInput').addEventListener('input', filterAndRenderModels);
    document.getElementById('sortSelect').addEventListener('change', (e) => setSort(e.target.value));
    document.getElementById('filterSelect').addEventListener('change', (e) => setFilter(e.target.value));
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.querySelectorAll('.tier-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setTier(btn.dataset.tier));
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });
    
    // Load models
    loadModels();
});
