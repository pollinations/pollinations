/**
 * Enter.pollinations.ai API Service
 */

export const ENTER_BASE_URL = "https://enter.pollinations.ai/api";

// API Keys
export const PLAYGROUND_API_KEY = "plln_pk_RRHEqHFAF7utI50fgWc418G7vLXybWg7wkkGQtBgNnZPGs3y4JKpqgEneL0YwQP2"; // For interactive playground features
export const UI_ASSETS_API_KEY = "plln_pk_DSf8DvxaLKn2LbP9QQAlA5hFpQGXePYiSY1AHZQn2CiKgtO7VBKQ1FNw1xCEpRYK"; // For website UI assets (logos, etc.)

function getAuthHeader() {
  return {
    "Authorization": `Bearer ${UI_ASSETS_API_KEY}`,
  };
}

/**
 * Generate image URL via enter.pollinations.ai
 */
export function getEnterImageURL(params) {
  const {
    prompt,
    model = "flux",
    width = 1024,
    height = 1024,
    seed = 42,
    enhance = false,
    nologo = false,
    image = null,
    ...otherParams
  } = params;

  const queryParams = new URLSearchParams();
  
  if (model) queryParams.set("model", model);
  if (width !== 1024) queryParams.set("width", width);
  if (height !== 1024) queryParams.set("height", height);
  if (seed !== 42) queryParams.set("seed", seed);
  if (enhance) queryParams.set("enhance", "true");
  if (nologo) queryParams.set("nologo", "true");
  
  // Add reference images
  if (image) {
    const imagesArray = Array.isArray(image)
      ? image
      : typeof image === "string"
        ? image.split(",").map((img) => img.trim())
        : [];
    if (imagesArray.length > 0) {
      queryParams.set("image", imagesArray.join(","));
    }
  }
  
  // Add other params
  Object.entries(otherParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.set(key, value);
    }
  });
  
  // Add API key to query params
  queryParams.set("key", UI_ASSETS_API_KEY);

  const url = `${ENTER_BASE_URL}/generate/image/${encodeURIComponent(prompt)}?${queryParams.toString()}`;
  return url;
}

/**
 * Generate text via enter.pollinations.ai (OpenAI-compatible)
 */
export async function generateText(prompt, params = {}) {
  const {
    model = "openai",
    temperature = 0.7,
    max_tokens = 1000,
    stream = false,
  } = params;

  const url = `${ENTER_BASE_URL}/generate/openai`;

  const body = {
    model,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt }
    ],
    temperature,
    max_tokens,
    stream,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Text generation failed: ${response.status}`);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Get available models
 */
export async function getModels(type = "image") {
  const endpoint = type === "image" 
    ? `${ENTER_BASE_URL}/generate/image/models`
    : `${ENTER_BASE_URL}/generate/text/models`;

  const response = await fetch(endpoint, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  return response.json();
}
