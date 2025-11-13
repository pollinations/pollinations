// API utilities for Pollinations chat - Enhanced version from vanilla
const BASE_TEXT_URL = 'https://enter.pollinations.ai/api/generate/v1';
const BASE_IMAGE_URL = 'https://enter.pollinations.ai/api/generate/image';
const TEXT_MODELS_ENDPOINT = 'https://enter.pollinations.ai/api/generate/v1/models';
const IMAGE_MODELS_ENDPOINT = 'https://enter.pollinations.ai/api/generate/image/models';
const API_TOKEN = 'plln_pk_pej6GSQ63nwKAULkaQRYGyAHbmyokXi6bi3qCYXhlenES0HwkbWOSctI9cHJnCIm';

let textModels = [];
let imageModels = [];
let abortController = null;

// Cache for models to avoid repeated API calls
let modelsCache = null;
let modelsCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Format model names
const formatModelName = (modelId) => {
  if (typeof modelId !== 'string') return 'Unknown Model';
  return modelId
    .split('/')
    .pop()
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Use real model ID as name instead of formatted version
const getRealModelName = (modelId) => {
  if (typeof modelId !== 'string') return 'Unknown Model';
  return modelId;
};

// Load available models from API
export const loadModels = async () => {
  // Check cache first
  if (modelsCache && modelsCacheTime && (Date.now() - modelsCacheTime < CACHE_DURATION)) {
    return modelsCache;
  }

  try {
    const [textResponse, imageResponse] = await Promise.allSettled([
      fetch(TEXT_MODELS_ENDPOINT, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`
        }
      }),
      fetch(IMAGE_MODELS_ENDPOINT, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`
        }
      })
    ]);

    if (textResponse.status === 'fulfilled' && textResponse.value.ok) {
      const textData = await textResponse.value.json();
      // Handle both array format and OpenAI format with data array
      const modelsArray = Array.isArray(textData) ? textData : textData.data;
      if (Array.isArray(modelsArray)) {
        textModels = modelsArray.map(model => ({
          id: model.id || model.name || model,
          name: getRealModelName(model.id || model.name || model),
          type: 'text',
          ownedBy: model.owned_by || 'unknown',
          created: model.created,
          supportsVision: model.vision === true,
          supportsAudio: model.audio === true,
          inputModalities: model.input_modalities || ['text'],
          outputModalities: model.output_modalities || ['text'],
          tier: model.tier || 'unknown',
          community: model.community || false
        }));
      }
    } else {
      console.error('❌ Failed to load text models from endpoint');
      textModels = [];
    }

    if (imageResponse.status === 'fulfilled' && imageResponse.value.ok) {
      const imageData = await imageResponse.value.json();
      if (Array.isArray(imageData)) {
        imageModels = imageData.map(model => {
          // Handle simple string array format
          const modelId = typeof model === 'string' ? model : (model.name || model.id || model);
          return {
            id: modelId,
            name: getRealModelName(modelId),
            type: 'image',
            tier: model.tier || 'unknown'
          };
        });
      }
    } else {
      console.error('❌ Failed to load image models from endpoint');
      imageModels = [];
    }

    // Cache the results
    const result = { textModels, imageModels };
    modelsCache = result;
    modelsCacheTime = Date.now();

    return result;
  } catch (error) {
    console.error('❌ Error loading models:', error);
    return { textModels: [], imageModels: [] };
  }
};

// Get all models
export const getModels = () => {
  return { textModels, imageModels };
};

// Build MODELS object from loaded models
export const MODELS = {};

// Initialize models (will be called from App.jsx)
export const initializeModels = async () => {
  const { textModels: loadedTextModels, imageModels: loadedImageModels } = await loadModels();
  
  // Populate MODELS object with text models
  const textModelsObj = {};
  loadedTextModels.forEach(model => {
    textModelsObj[model.id] = { name: model.name, ...model };
  });
  
  // Populate image models object
  const imageModelsObj = {};
  loadedImageModels.forEach(model => {
    imageModelsObj[model.id] = { name: model.name, ...model };
  });
  
  // Copy to global MODELS for backward compatibility
  Object.assign(MODELS, textModelsObj);
  
  return { textModels: textModelsObj, imageModels: imageModelsObj };
};

// Get current model info
const getCurrentModelInfo = (modelId) => {
  const allModels = [...textModels, ...imageModels];
  return allModels.find(m => m.id === modelId);
};

// Get latest image from messages
const getLatestImage = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.image && msg.image.src) {
      return msg.image.src;
    }
  }
  return null;
};

const extractBase64FromDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return { base64: '', mimeType: null };
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { base64: match[2], mimeType: match[1] };
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex >= 0) {
    return { base64: dataUrl.slice(commaIndex + 1), mimeType: null };
  }
  return { base64: dataUrl, mimeType: null };
};

// Update formatMessagesForAPI to ensure consistent array format
export const formatMessagesForAPI = (messages, modelId) => {
  const currentModel = getCurrentModelInfo(modelId);
  const supportsVision = currentModel && currentModel.supportsVision;
  return messages.map(msg => {
    const parts = [];
    const textContent = typeof msg.content === 'string' ? msg.content : '';

    if (textContent) {
      parts.push({
        type: 'text',
        text: textContent
      });
    }

    const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
    const legacyImage = (!attachments.length && msg.image && msg.image.src)
      ? [{
        name: msg.image.name || 'image',
        data: msg.image.src,
        mimeType: msg.image.mimeType || (msg.image.src.startsWith('data:') ? msg.image.src.split(';')[0].replace('data:', '') : 'image/png'),
        isImage: true
      }]
      : [];

    [...attachments, ...legacyImage].forEach((attachment) => {
      if (!attachment) return;

      let base64Data = attachment.data || attachment.base64 || '';
      let mimeType = attachment.mimeType || attachment.type || 'application/octet-stream';

      if (!base64Data && attachment.preview) {
        const extracted = extractBase64FromDataUrl(attachment.preview);
        base64Data = extracted.base64;
        if (extracted.mimeType && (!attachment.mimeType || attachment.mimeType === '')) {
          mimeType = extracted.mimeType;
        }
      }

      if (!base64Data && typeof attachment.src === 'string') {
        const extracted = extractBase64FromDataUrl(attachment.src);
        base64Data = extracted.base64;
        if (extracted.mimeType) {
          mimeType = extracted.mimeType;
        }
      }

      if (!base64Data) return;

      const isImage = attachment.isImage ?? mimeType.startsWith('image/');

      // Use image_url format for remote images
      if (isImage && attachment.preview?.startsWith('http')) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: attachment.preview
          }
        });
        return;
      }

      // For local base64, include as image_url with data URL
      if (isImage && base64Data) {
        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`
          }
        });
      }
    });

    // If only text, return string content for compatibility
    if (parts.length === 1 && parts[0].type === 'text') {
      return {
        role: msg.role,
        content: parts[0].text
      };
    }

    // If multiple parts or has images, return array
    if (parts.length > 0) {
      return {
        role: msg.role,
        content: parts
      };
    }

    return {
      role: msg.role,
      content: textContent || ''
    };
  });
};

export const sendMessage = async (messages, onChunk, onComplete, onError, modelId) => {
  const selectedModelId =  modelId || localStorage.getItem('selectedModelId') || 'openai-large';
   
  
  try {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const formattedMessages = formatMessagesForAPI(messages, selectedModelId);

    const response = await fetch('https://enter.pollinations.ai/api/generate/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        model: selectedModelId,
        messages: formattedMessages,
        max_tokens: 2000
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const fullContent = data?.choices?.[0]?.message?.content || '';
    console.log('Full response content:', fullContent);
    
    if (onChunk) onChunk(fullContent, fullContent, '');
    if (onComplete) onComplete(fullContent, '');

    abortController = null;
    return fullContent;
  } catch (error) {
    abortController = null;
    if (error.name === 'AbortError') {
      if (onError) onError(new Error('User aborted'));
      return null;
    }
    console.error('Request error:', error);
    if (onError) onError(error);
    throw error;
  }
};

export const stopGeneration = () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
};
// Generate image from text prompt
export const generateImage = async (prompt, options = {}) => {
  try {
    const {
      model = 'flux',
      width = 1024,
      height = 1024,
      seed = Math.floor(Math.random() * 2147483647),
      nologo = false,
      enhance = false,
      nofeed = false,
      safe = false,
      quality = 'medium'
    } = options;

    // Build URL with prompt in path and parameters as query string
    const params = new URLSearchParams({
      model,
      width: width.toString(),
      height: height.toString(),
      seed: seed.toString(),
      enhance: enhance.toString(),
      nologo: nologo.toString(),
      nofeed: nofeed.toString(),
      safe: safe.toString(),
      quality
    });

    // Encode the prompt for URL path
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `${BASE_IMAGE_URL}/${encodedPrompt}?${params.toString()}`;
    
    console.log(`🎨 Generating image with prompt: "${prompt}"`);
    console.log(`📐 Parameters: ${width}x${height}, model: ${model}, seed: ${seed}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
    }

    // Get the image as a blob
    const blob = await response.blob();
    
    // Convert blob to base64 data URL for display
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log(`✅ Image generated successfully`);
        resolve({
          url: reader.result,
          prompt,
          model,
          width,
          height,
          seed
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('❌ Image generation error:', error);
    throw error;
  }
};

// Get available image models
export const getImageModels = () => {
  return imageModels.length > 0 ? imageModels : [
    { id: 'flux', name: 'Flux', type: 'image' },
    { id: 'flux-realism', name: 'Flux Realism', type: 'image' },
    { id: 'flux-anime', name: 'Flux Anime', type: 'image' },
    { id: 'flux-3d', name: 'Flux 3D', type: 'image' },
    { id: 'turbo', name: 'Turbo', type: 'image' }
  ];
};

export { BASE_TEXT_URL, BASE_IMAGE_URL };


