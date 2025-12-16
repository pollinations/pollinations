#  Pollinations MCP Enhanced Features Documentation

This document outlines the new enhanced features added to the Pollinations Model Context Protocol (MCP) server.

##  Table of Contents

1. [Video Generation Support](#video-generation-support)
2. [Advanced Reasoning Mode](#advanced-reasoning-mode)
3. [System Status & Health Monitoring](#system-status--health-monitoring)
4. [Usage Examples](#usage-examples)
5. [Integration Guide](#integration-guide)

---

## 🎥 Video Generation Support

### Overview
Generate high-quality videos from text prompts using state-of-the-art video models.

### Available Models
- **Veo**: Google's advanced video generation model with cinematic quality
- **Seedance**: ByteDance's video generation model with Pro-Fast optimization

### Tools

#### `generateVideoUrl`
Generate a video URL from a text prompt with full customization options.

**Parameters:**
- `prompt` (string, required): Text description of the video to generate
- `model` (string, optional): Model to use (`veo` or `seedance`, default: `veo`)
- `seed` (number, optional): Seed for reproducible results
- `width` (number, optional): Video width in pixels (default: 1280)
- `height` (number, optional): Video height in pixels (default: 720)
- `duration` (number, optional): Duration in seconds (default: 5, max: 10)

#### `generateVeoVideo`
Convenience function for generating videos with Google's Veo model.

#### `generateSeedanceVideo`
Convenience function for generating videos with ByteDance's Seedance model.

#### `listVideoModels`
List available video models and their capabilities.

### Example Usage
```javascript
// Generate a cinematic video
const video = await generateVideoUrl({
    prompt: "A majestic dragon flying through a sunset sky over ancient mountains",
    model: "veo",
    width: 1920,
    height: 1080,
    duration: 8
});

// Generate with Seedance for faster processing
const fastVideo = await generateSeedanceVideo({
    prompt: "A futuristic city with flying cars at night",
    duration: 5
});
```

---

## Advanced Reasoning Mode

### Overview
Perform complex reasoning tasks using deep-thinking models with multi-step analysis chains.

### Authentication Required
**Important**: The reasoning service requires authentication via GitHub OAuth to access the gen.pollinations.ai endpoint. See the [Authentication Setup](#authentication-setup) section below.

### Available Models
- **DeepSeek**: State-of-the-art reasoning model (default, recommended for logic/math/analysis)
- **OpenAI**: GPT models for general reasoning tasks
- **Claude**: Anthropic's Claude models for structured reasoning
- **Gemini**: Google's Gemini models for multi-modal reasoning

### Tools

#### `deepReasoning`
Perform deep reasoning analysis on complex questions with step-by-step thinking.

**Parameters:**
- `prompt` (string, required): Main question or problem to solve
- `context` (string, optional): Additional context or background information
- `reasoningModel` (string, optional): Model for reasoning (default: `deepseek`)
- `finalModel` (string, optional): Model for final answer (default: `deepseek`)
- `maxReasoningTokens` (number, optional): Max tokens for reasoning (default: 2000)
- `maxFinalTokens` (number, optional): Max tokens for final answer (default: 1000)
- `temperature` (number, optional): Temperature for final generation (default: 0.7)
- `json` (boolean, optional): Return JSON format (default: false)

#### `solveMathProblem`
Solve complex mathematical problems with detailed step-by-step reasoning.

**Parameters:**
- `problem` (string, required): Mathematical problem to solve
- `reasoningModel` (string, optional): Model for mathematical reasoning (default: `deepseek`)
- `showSteps` (boolean, optional): Whether to show solution steps (default: true)

#### `analyzeCodeWithReasoning`
Analyze code with deep reasoning about functionality, bugs, and improvements.

**Parameters:**
- `code` (string, required): Code to analyze
- `language` (string, optional): Programming language of the code
- `question` (string, optional): Specific question about the code
- `reasoningModel` (string, optional): Model for code analysis (default: `deepseek`)

#### `listReasoningModels`
List available reasoning models and their specialties.

### Example Usage
```javascript
// Complex reasoning
const reasoning = await deepReasoning({
    prompt: "What are the ethical implications of AI consciousness?",
    context: "Considering current AI development trends and philosophical theories",
    reasoningModel: "deepseek"
});

// Mathematical problem solving
const mathSolution = await solveMathProblem({
    problem: "Find the derivative of f(x) = x³sin(x) + 2x²cos(x)",
    showSteps: true,
    reasoningModel: "deepseek"
});

// Code analysis
const codeAnalysis = await analyzeCodeWithReasoning({
    code: "function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }",
    language: "javascript",
    question: "What are the performance implications and how can this be optimized?",
    reasoningModel: "deepseek"
});
```

---

##  System Status & Health Monitoring

### Overview
Monitor system health, check API status, and get comprehensive diagnostics.

### Tools

#### `getSystemStatus`
Get comprehensive system status and health information.

**Parameters:**
- `detailed` (boolean, optional): Include detailed information (default: false)
- `checkApis` (boolean, optional): Perform live API health checks (default: false)

#### `listAvailableModels`
List all available models across different modalities.

**Parameters:**
- `modality` (string, optional): Filter by modality (text, image, video, audio)

#### `getApiEndpoints`
Get information about all available API endpoints.

#### `checkApiHealth`
Perform comprehensive API health check with timing information.

**Parameters:**
- `timeout` (number, optional): Timeout in milliseconds (default: 5000)
- `detailed` (boolean, optional): Include detailed timing (default: false)

### Example Usage
```javascript
// Basic system status
const status = await getSystemStatus({
    detailed: true,
    checkApis: true
});

// List specific models
const textModels = await listAvailableModels({
    modality: "text"
});

// Health check
const health = await checkApiHealth({
    timeout: 3000,
    detailed: true
});
```

---

##  Usage Examples

### Complete Workflow Example
```javascript
// 1. Check system status
const status = await getSystemStatus({ checkApis: true });

// 2. Generate content with reasoning (requires authentication)
const reasoning = await deepReasoning({
    prompt: "Create a story about AI and human collaboration",
    reasoningModel: "deepseek"
});

// 3. Generate supporting image
const image = await generateImage({
    prompt: "Futuristic human-AI collaboration scene",
    model: "flux"
});

// 4. Generate video trailer
const video = await generateVeoVideo({
    prompt: "Animated trailer for the AI-human collaboration story",
    duration: 8
});

// 5. Generate audio narration
const audio = await generateAudio({
    text: "Welcome to the future of human-AI collaboration...",
    voice: "alloy"
});
```

---

## 🔧 Integration Guide

### For AI Assistants (Claude, etc.)
```json
{
    "mcpServers": {
        "pollinations": {
            "command": "npx",
            "args": ["@pollinations/model-context-protocol"]
        }
    }
}
```

### For Custom Applications
```javascript
import { startMcpServer } from "@pollinations/model-context-protocol";

// Start the MCP server
await startMcpServer();
```

### Environment Variables
- `POLLINATIONS_API_KEY`: Optional API key for enhanced rate limits
- `POLLINATIONS_BASE_URL`: Custom API base URL (default: https://gen.pollinations.ai)

---

## 🔐 Authentication Setup

### GitHub OAuth Authentication
The reasoning service requires authentication to access the gen.pollinations.ai endpoint. The MCP server includes a complete OAuth flow with PKCE security.

### Authentication Process
1. **Start Authentication**: Use the `startAuth` tool to initiate the GitHub OAuth flow
2. **Complete OAuth**: Visit the provided auth URL and authorize with GitHub
3. **Exchange Token**: Use the `exchangeToken` tool with the authorization code
4. **Access Granted**: The server will store your access token for authenticated requests

### Authentication Tools
- `startAuth`: Initiates GitHub OAuth flow with PKCE security
- `exchangeToken`: Exchanges authorization code for access token
- `refreshToken`: Refreshes expired access tokens
- `getDomains`: Gets allowlisted domains for authenticated user
- `updateDomains`: Updates allowlisted domains

### Example Authentication Flow
```javascript
// 1. Start authentication
const authStart = await startAuth();
// Visit authStart.authUrl in your browser

// 2. After authorization, exchange the code
const tokens = await exchangeToken({
    code: "authorization_code_from_callback",
    codeVerifier: authStart.codeVerifier
});

// 3. Now you can use reasoning tools with authentication
const reasoning = await deepReasoning({
    prompt: "Analyze the ethical implications of AI consciousness",
    reasoningModel: "deepseek"
});
```

### Security Notes
- PKCE (Proof Key for Code Exchange) is used for enhanced security
- Access tokens are stored in-memory (production deployments should use secure storage)
- Tokens automatically refresh before expiration

---

##  Best Practices

1. **Model Selection**: Choose appropriate models based on your use case
   - Video: Use `veo` for cinematic quality, `seedance` for faster processing
   - Reasoning: Use `openai` for general reasoning (currently supported), other models planned for future release
   - Note: Due to current API limitations, reasoning models only support OpenAI, and advanced parameters like temperature, max_tokens, and JSON format are not yet available

2. **Error Handling**: Always implement proper error handling for API calls
   - Use `getSystemStatus` to check API health before operations
   - Implement retry logic with exponential backoff

3. **Performance Optimization**:
   - Use appropriate token limits to avoid excessive processing
   - Leverage caching for repeated requests
   - Monitor response times with detailed health checks

4. **Content Safety**: All generated content is automatically filtered for safety

---

## 📊 Feature Comparison

| Feature | Basic | Enhanced | Premium |
|---------|--------|----------|---------|
| Text Generation | ✅ | ✅ | ✅ |
| Image Generation | ✅ | ✅ | ✅ |
| Audio Generation | ✅ | ✅ | ✅ |
| **Video Generation** | ❌ | ✅ | ✅ |
| **Advanced Reasoning** | ❌ | ✅ | ✅ |
| **System Monitoring** | ❌ | ✅ | ✅ |
| Model Selection | Limited | Full | Full |
| Health Checks | ❌ | ✅ | ✅ |

---

## 🔮 Future Enhancements

- **3D Model Generation**: Support for 3D asset creation
- **Advanced Video Editing**: Video-to-video transformations
- **Multi-Modal Reasoning**: Combine text, image, and video reasoning
- **Custom Model Training**: Fine-tune models for specific domains
- **Real-Time Streaming**: Live video and audio generation

---

**🌟 Ready to enhance your AI applications with these powerful new features!**