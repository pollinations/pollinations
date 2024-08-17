const fetch = require('node-fetch');

// This is the ComfyUI api prompt format.

// If you want it for a specific workflow you can "enable dev mode options"
// in the settings of the UI (gear beside the "Queue Size: ") this will enable
// a button on the UI to save workflows in api format.

// Keep in mind ComfyUI is pre-alpha software so this format might change.

// Function to create the prompt with dynamic inputs
function createPrompt(dynamicText, width = 1024, height = 1024, seed = 711058089000452) {
    return {
        "6": {
            "inputs": {
                "text": dynamicText,
                "clip": ["30", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "samples": ["31", 0],
                "vae": ["30", 2]
            },
            "class_type": "VAEDecode"
        },
        "9": {
            "inputs": {
                "images": ["8", 0],
                "filename_prefix": "ComfyUI"
            },
            "class_type": "SaveImage"
        },
        "27": {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptySD3LatentImage"
        },
        "30": {
            "inputs": {
                "ckpt_name": "FLUX1/flux1-schnell-fp8.safetensors"
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "31": {
            "inputs": {
                "seed": seed,
                "steps": 1,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["30", 0],
                "positive": ["6", 0],
                "negative": ["33", 0],
                "latent_image": ["27", 0]
            },
            "class_type": "KSampler"
        },
        "33": {
            "inputs": {
                "text": "",
                "clip": ["30", 1]
            },
            "class_type": "CLIPTextEncode"
        }
    };
}

async function queuePrompt(prompt) {
    const response = await fetch("http://127.0.0.1:8188/prompt", {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt }),
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

async function getHistory(promptId) {
    const response = await fetch(`http://127.0.0.1:8188/history/${promptId}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function pollHistory(promptId) {
    while (true) {
        const history = await getHistory(promptId);
        console.log(history);
        const promptHistory = history[promptId];
        if (promptHistory?.status?.completed) {
            console.log('Generation completed:', promptHistory);
            return Object.values(promptHistory.outputs)[0]?.images[0]?.filename;
        } else if (promptHistory?.status?.status_str === 'error') {
            console.error('Generation failed:', promptHistory);
            throw new Error('Generation failed:', promptHistory);
        }
        console.log('Generation in progress:', promptHistory);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before polling again
    }
}

// Example usage with dynamic inputs
const dynamicText = "a beautiful rainbow galaxy inside it on top of a wooden table in the middle of a modern kitchen beside a plate of vegetables and mushrooms and a wine glasse that contains a planet earth with a plate with a half eaten apple pie on it" + Math.random();
const width = 1024;
const height = 1024;
const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
const prompt = createPrompt(dynamicText, width, height, seed);

// Queue the prompt and then poll for results
queuePrompt(prompt)
    .then(data => {
        console.log('Prompt queued:', data);
        return pollHistory(data.prompt_id);
    })
    .then(image => {
        console.log('Image generated:', image);
    })
    .catch((error) => console.error('Error:', error));
