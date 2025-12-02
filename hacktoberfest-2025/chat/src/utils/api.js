// API utilities for Pollinations chat - Enhanced version from vanilla
const BASE_IMAGE_URL = 'https://enter.pollinations.ai/api/generate/image';
const TEXT_MODELS_ENDPOINT = 'https://enter.pollinations.ai/api/generate/v1/models';
const IMAGE_MODELS_ENDPOINT = 'https://enter.pollinations.ai/api/generate/image/models';
const API_TOKEN = 'plln_sk_PENx8AtHMF9BJ00rWOUFz4LFCgimBsW8';

let textModels = [];
let imageModels = [];
let videoModels = [];
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
          name: model.description || getRealModelName(model.id || model.name || model),
          description: model.description || model.id || model.name || model,
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
        // Separate image and video models based on output_modalities
        const allMediaModels = imageData.map(model => {
          const modelId = typeof model === 'string' ? model : (model.name || model.id || model);
          const outputModalities = model.output_modalities || ['image'];
          return {
            id: modelId,
            name: (typeof model === 'object' && model.description) ? model.description : getRealModelName(modelId),
            description: model.description || modelId,
            type: outputModalities.includes('video') ? 'video' : 'image',
            tier: model.tier || 'unknown',
            outputModalities
          };
        });
        
        imageModels = allMediaModels.filter(m => m.type === 'image');
        videoModels = allMediaModels.filter(m => m.type === 'video');
      }
    } else {
      console.error('❌ Failed to load image models from endpoint');
      imageModels = [];
      videoModels = [];
    }

    // Cache the results
    const result = { textModels, imageModels, videoModels };
    modelsCache = result;
    modelsCacheTime = Date.now();

    return result;
  } catch (error) {
    console.error('❌ Error loading models:', error);
    return { textModels: [], imageModels: [], videoModels: [] };
  }
};

// Get all models
export const getModels = () => {
  return { textModels, imageModels, videoModels };
};

// Initialize models (will be called from App.jsx)
export const initializeModels = async () => {
  const { textModels: loadedTextModels, imageModels: loadedImageModels, videoModels: loadedVideoModels } = await loadModels();
  
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
  
  // Populate video models object
  const videoModelsObj = {};
  loadedVideoModels.forEach(model => {
    videoModelsObj[model.id] = { name: model.name, ...model };
  });
  
  return { textModels: textModelsObj, imageModels: imageModelsObj, videoModels: videoModelsObj };
};

// Get current model info
const getCurrentModelInfo = (modelId) => {
  const allModels = [...textModels, ...imageModels, ...videoModels];
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

const containsChartRequest = (messages = []) => {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') return false;
  const content = typeof lastMessage.content === 'string' ? lastMessage.content.toLowerCase() : '';
  if (!content) return false;
  return /(chart|graph|plot|visualiz|scatter|line|bar|pie|histogram|trend)/.test(content);
};

export const sendMessage = async (messages, onChunk, onComplete, onError, modelId, generationConfig = {}) => {
  const selectedModelId =  modelId || localStorage.getItem('selectedModelId') || 'openai-large';
   
  const {
    maxTokens = 2000,
    temperature = 0.7,
    topP = 1
  } = generationConfig;

  // For Claude models with thinking enabled, temperature must be 1
  const isClaude = selectedModelId.includes('claude');
  const finalTemperature = isClaude ? 1 : temperature;

  const chartRequested = containsChartRequest(messages);
  
  const tools = [
    {
      type: 'function',
      function: {
        name: 'create_chart',
        description: 'Create a chart or graph visualization from data points.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title displayed above the chart.'
            },
            data: {
              type: 'array',
              items: {
                type: 'object',
                description: 'Data points where each object represents a row with keys for x/y values.'
              },
              description: 'Array of data objects, each containing keys for the chart axes.'
            },
            series: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'The key in data objects for this series' },
                  name: { type: 'string', description: 'Display name for this series' },
                  color: { type: 'string', description: 'Hex color for this series' }
                },
                required: ['key', 'name']
              },
              description: 'Series definitions for the chart.'
            },
            xKey: {
              type: 'string',
              description: 'The key in data objects to use for x-axis values.'
            },
            xLabel: {
              type: 'string',
              description: 'Label for the x-axis.'
            },
            yLabel: {
              type: 'string',
              description: 'Label for the y-axis.'
            }
          },
          required: ['title', 'data', 'series', 'xKey']
        }
      }
    }
  ];

  try {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const formattedMessages = formatMessagesForAPI(messages, selectedModelId);

    // Build request body - only include thinking parameters for Claude models
    // Note: Some Bedrock models don't support both temperature and top_p together,
    // so we only include top_p when it differs from the default value of 1
    const requestBody = {
      model: selectedModelId,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature: finalTemperature,
      tools,
      tool_choice: chartRequested ? { type: 'function', function: { name: 'create_chart' } } : 'auto',
      stream: true
    };

    // Only include top_p if it differs from the default value of 1
    // This avoids conflicts with Bedrock models that don't support both temperature and top_p
    if (topP !== 1) {
      requestBody.top_p = topP;
    }

    // Only add thinking parameters for Claude models
    if (isClaude) {
      requestBody.thinking = { type: 'enabled' };
      requestBody.reasoning_effort = 'high';
    }

    const response = await fetch('https://enter.pollinations.ai/api/generate/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    const functionBuffers = {};
    const collectedFunctionCalls = [];
    let lastFunctionName = null;
    let pendingData = '';
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;

          const dataString = pendingData ? pendingData + payload : payload;
          let parsed;
          try {
            parsed = JSON.parse(dataString);
            pendingData = '';
          } catch (parseError) {
            // Hold onto partial JSON until the rest of the chunk arrives.
            pendingData = dataString;
            continue;
          }

          const delta = parsed?.choices?.[0]?.delta;
          if (!delta) continue;

          const content = delta?.content || '';
          if (content) {
            fullContent += content;
            if (onChunk) onChunk(content, fullContent, '');
          }

          const toolCall = delta?.tool_calls?.[0];
          if (toolCall?.function) {
            const fn = toolCall.function;
            const name = fn?.name || lastFunctionName || 'unknown_function';
            if (fn?.name) lastFunctionName = fn.name;
            const argChunk = fn?.arguments || '';
            if (!functionBuffers[name]) functionBuffers[name] = '';
            functionBuffers[name] += argChunk;

            let parsedArgs = null;
            try {
              const attempt = JSON.parse(functionBuffers[name]);
              parsedArgs = typeof attempt === 'string' ? JSON.parse(attempt) : attempt;
            } catch (err) {
              parsedArgs = null;
            }

            if (parsedArgs !== null) {
              collectedFunctionCalls.push({ name, arguments: parsedArgs });
              delete functionBuffers[name];
            }
          }

          const legacyCall = delta?.function_call;
          if (legacyCall) {
            const name = legacyCall?.name || lastFunctionName || 'unknown_function';
            if (legacyCall?.name) lastFunctionName = legacyCall.name;
            const argChunk = legacyCall?.arguments || '';
            if (!functionBuffers[name]) functionBuffers[name] = '';
            functionBuffers[name] += argChunk;

            let parsedArgs = null;
            try {
              const attempt = JSON.parse(functionBuffers[name]);
              parsedArgs = typeof attempt === 'string' ? JSON.parse(attempt) : attempt;
            } catch (err) {
              parsedArgs = null;
            }

            if (parsedArgs !== null) {
              collectedFunctionCalls.push({ name, arguments: parsedArgs });
              delete functionBuffers[name];
            }
          }
        }
      }
    }

    let finalContent = fullContent;
    if (typeof finalContent === 'string') {
      finalContent = finalContent.replace(/\s+$/g, '').replace(/\n{3,}/g, '\n\n');
    }
    if (collectedFunctionCalls.length > 0) {
      for (const call of collectedFunctionCalls) {
        if (call.name === 'create_chart') {
          try {
            const args = call.arguments;
            // Use Nuxt-style format directly from function arguments
            const chartData = {
              type: 'chart',
              output: {
                title: args.title,
                data: args.data,
                series: args.series,
                xKey: args.xKey,
                xLabel: args.xLabel || 'X Axis',
                yLabel: args.yLabel || 'Y Axis'
              }
            };
            finalContent += `\n\n__CHART__${JSON.stringify(chartData)}__CHART__`;
          } catch (chartError) {
            console.error('Failed to parse chart arguments:', chartError);
          }
        }
      }
    }

    if (onComplete) onComplete(finalContent, '');

    abortController = null;
    return finalContent;
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

// Generate video from text prompt
export const generateVideo = async (prompt, options = {}) => {
  try {
    const {
      model = 'veo',
      seed = Math.floor(Math.random() * 2147483647),
      nologo = false,
      nofeed = false
    } = options;

    // Build URL with prompt in path and parameters as query string
    const params = new URLSearchParams({
      model,
      seed: seed.toString(),
      nologo: nologo.toString(),
      nofeed: nofeed.toString()
    });

    // Encode the prompt for URL path
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `${BASE_IMAGE_URL}/${encodedPrompt}?${params.toString()}`;
    
    console.log(`🎬 Generating video with prompt: "${prompt}"`);
    console.log(`📐 Parameters: model: ${model}, seed: ${seed}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Video generation failed: ${response.status} - ${errorText}`);
    }

    // Get the video as a blob
    const blob = await response.blob();
    
    // Convert blob to base64 data URL for display
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log(`✅ Video generated successfully`);
        resolve({
          url: reader.result,
          prompt,
          model,
          seed
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('❌ Video generation error:', error);
    throw error;
  }
};
