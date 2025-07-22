# Image.pollinations.ai API Endpoints

## Overview

The image.pollinations.ai service provides AI-powered image generation through a REST API. The service uses a two-tier architecture with Cloudflare Workers for caching and an origin service for image generation.

## Core Image Generation Endpoints

### 1. Image Generation
- **URL Pattern**: `/prompt/{prompt}`
- **Method**: GET
- **Description**: Main endpoint for generating images from text prompts
- **Parameters**:
  - `model` - AI model to use (see `/models` endpoint for available options)
  - `width` - Image width (default varies by model)
  - `height` - Image height (default varies by model)
  - `seed` - Random seed for reproducible results
  - `enhance` - Enable prompt enhancement (boolean)
  - `nologo` - Disable Pollinations logo (boolean)
  - `nofeed` - Exclude from public feed (boolean)
  - `private` - Mark as private (boolean)
  - `safe` - Enable safety filters (boolean)
- **Response**: Image (JPEG format)
- **Cache**: Cached in R2 storage via Cloudflare Worker

## Utility Endpoints

### 2. Available Models
- **URL**: `/models`
- **Method**: GET
- **Description**: Returns list of available AI models
- **Response**: JSON array of model names
- **Cache**: No cache headers (always fresh)

### 3. Server Registration
- **URL**: `/register`
- **Method**: POST
- **Description**: Endpoint for worker servers to register themselves
- **Response**: JSON confirmation
- **Cache**: No cache headers

### 4. Feed Listener
- **URL Pattern**: `/feed`
- **Method**: GET (Server-Sent Events)
- **Description**: Real-time feed of image generation events
- **Response**: SSE stream of generation events

## Static/Utility Endpoints

### 5. Cross-Domain Policy
- **URL**: `/crossdomain.xml`
- **Method**: GET
- **Description**: Flash cross-domain policy file
- **Response**: XML policy allowing cross-domain access

### 6. SSL Certificate Challenge
- **URL**: `/.well-known/acme-challenge/{token}`
- **Method**: GET
- **Description**: Let's Encrypt SSL certificate validation
- **Response**: Plain text challenge response

## Error Handling

### 7. 404 Handler
- **Pattern**: Any path not matching above patterns
- **Method**: Any
- **Response**: JSON error with 404 status

## Test Categories for Systematic Testing

### 1. Basic Image Generation Tests
```
GET /prompt/a%20beautiful%20sunset
GET /prompt/cat%20playing%20with%20yarn?model=flux
GET /prompt/abstract%20art?width=512&height=512
GET /prompt/landscape?seed=12345
```

### 2. Parameter Validation Tests
```
GET /prompt/test?width=invalid
GET /prompt/test?height=-100
GET /prompt/test?model=nonexistent
GET /prompt/test?seed=abc
```

### 3. Authentication & Rate Limiting Tests
```
GET /prompt/test (without token)
GET /prompt/test (with valid token)
GET /prompt/test (with invalid token)
Multiple rapid requests from same IP
```

### 4. Content Safety Tests
```
GET /prompt/inappropriate%20content
GET /prompt/violent%20content
GET /prompt/test?safe=true
GET /prompt/test?safe=false
```

### 5. Caching Tests
```
GET /prompt/test (first request - cache miss)
GET /prompt/test (second request - cache hit)
GET /prompt/test?no-cache=true
```

### 6. Feed & Analytics Tests
```
GET /feed (SSE connection)
GET /prompt/test?nofeed=true
GET /prompt/test?private=true
```

### 7. Utility Endpoint Tests
```
GET /models
POST /register
GET /crossdomain.xml
GET /.well-known/acme-challenge/test
```

### 8. Error Condition Tests
```
GET /nonexistent
POST /prompt/test (wrong method)
GET /prompt/ (empty prompt)
GET /prompt/test (server overload simulation)
```

### 9. Header & CORS Tests
```
OPTIONS /prompt/test
GET /prompt/test (check CORS headers)
GET /prompt/test (check Content-Disposition)
GET /prompt/test (check Cache-Control)
```

### 10. Performance & Load Tests
```
Concurrent requests to /prompt/test
Large prompt text handling
Multiple parameter combinations
Cache performance validation
```

## Architecture Notes

- **Cloudflare Worker**: Handles caching and serves as entry point (image.pollinations.ai)
- **Origin Service**: Handles actual image generation (image-origin.pollinations.ai)
- **Rate Limiting**: 1 request per 10 seconds per IP for unauthenticated users
- **Authentication**: Token-based authentication with tier-based rate limits
- **Safety**: Content moderation using LlamaGuard and NSFW detection
- **Caching**: R2 storage with semantic similarity caching for related prompts