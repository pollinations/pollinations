# Implementation Plan: Log Image Requests to Tinybird (Issue #2468)

## Overview
This document outlines the implementation plan for adding Tinybird observability to the image.pollinations.ai service, following the existing pattern from text.pollinations.ai while maintaining the "thin proxy" design principle.

## Goals
- Track all image generation requests to Tinybird for observability
- Extract and share common observability logic between services
- Maintain minimal performance impact
- Follow DRY principles established in the codebase

## 1. Extract and Generalize Observability Logic

### 1.1 Create Shared Tinybird Tracker
**Location**: `shared/observability/tinybirdTracker.js`

Move the current `text.pollinations.ai/observability/tinybirdTracker.js` to the shared folder and generalize it:

```javascript
// shared/observability/tinybirdTracker.js
import '../env-loader.js'; // Use shared env loader
import debug from 'debug';

const log = debug('pollinations:tinybird');
const errorLog = debug('pollinations:tinybird:error');

const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL || 'https://api.europe-west2.gcp.tinybird.co';
const TINYBIRD_API_KEY = process.env.TINYBIRD_API_KEY;

/**
 * Send event telemetry to Tinybird
 * @param {Object} eventData - The event data to send
 * @param {string} serviceType - The service type ('text' or 'image')
 * @returns {Promise} - Promise that resolves when the event is sent
 */
export async function sendTinybirdEvent(eventData, serviceType = 'text') {
    if (!TINYBIRD_API_KEY) {
        log('TINYBIRD_API_KEY not set, skipping telemetry');
        return;
    }
    
    try {
        const event = {
            // Common fields for all services
            service_type: serviceType,
            start_time: eventData.startTime?.toISOString(),
            end_time: eventData.endTime?.toISOString(),
            message_id: eventData.requestId,
            id: eventData.requestId,
            duration: eventData.duration,
            user: eventData.username || eventData.user || 'anonymous',
            username: eventData.username,
            tier: eventData.tier,
            status: eventData.status,
            log_event_type: eventData.eventType || 'completion',
            
            // Service-specific fields
            ...(serviceType === 'text' ? getTextEventFields(eventData) : getImageEventFields(eventData)),
            
            // Metadata
            proxy_metadata: {
                organization: 'pollinations',
                project: `${serviceType}.pollinations.ai`,
                environment: process.env.NODE_ENV || 'development',
                ...eventData.metadata
            },
            
            // Error info if applicable
            ...(eventData.status === 'error' && {
                exception: eventData.error?.message || 'Unknown error',
                traceback: eventData.error?.stack || '',
            }),
        };
        
        // Send event with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${TINYBIRD_API_URL}/v0/events?name=pollinations_events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TINYBIRD_API_KEY}`,
            },
            body: JSON.stringify(event),
            signal: controller.signal
        });
        
        if (!response.ok) {
            errorLog(`Failed to send telemetry: ${response.status}`);
        } else {
            log(`Successfully sent ${serviceType} telemetry event`);
        }
        
        clearTimeout(timeoutId);
    } catch (error) {
        errorLog(`Error sending telemetry: ${error.message}`);
    }
}

function getTextEventFields(eventData) {
    return {
        model: eventData.model || 'unknown',
        provider: eventData.provider,
        cost: eventData.cost || 0,
        prompt_tokens: eventData.usage?.prompt_tokens,
        completion_tokens: eventData.usage?.completion_tokens,
        cached_tokens: eventData.usage?.cached_tokens,
        call_type: 'completion'
    };
}

function getImageEventFields(eventData) {
    return {
        model: eventData.model || 'unknown',
        prompt: eventData.private ? '[PRIVATE]' : eventData.prompt,
        width: eventData.width,
        height: eventData.height,
        seed: eventData.seed,
        steps: eventData.steps,
        guidance: eventData.guidance,
        nologo: eventData.nologo,
        enhance: eventData.enhance,
        private: eventData.private,
        nofeed: eventData.nofeed,
        is_child: eventData.is_child,
        is_mature: eventData.is_mature,
        was_transformed: eventData.was_transformed,
        cache_status: eventData.cache_status,
        referrer: eventData.referrer,
        call_type: 'image_generation'
    };
}
```

### 1.2 Update Text Service Imports
Update `text.pollinations.ai/genericOpenAIClient.js` and other files to use the shared tracker:
```javascript
import { sendTinybirdEvent } from '../../shared/observability/tinybirdTracker.js';
```

## 2. Tinybird Schema Updates

### 2.1 Create Unified Event Schema
Create a new Tinybird data source that can handle both text and image events:

```sql
SCHEMA >
    `service_type` String,
    `start_time` DateTime,
    `end_time` DateTime,
    `message_id` String,
    `id` String,
    `duration` UInt32,
    `user` String,
    `username` String,
    `tier` String,
    `status` String,
    `log_event_type` String,
    `call_type` String,
    
    -- Model information
    `model` String,
    `provider` String,
    
    -- Text-specific fields
    `cost` Float32,
    `prompt_tokens` UInt32,
    `completion_tokens` UInt32,
    `cached_tokens` UInt32,
    
    -- Image-specific fields
    `prompt` String,
    `width` UInt16,
    `height` UInt16,
    `seed` String,
    `steps` UInt16,
    `guidance` Float32,
    `nologo` Boolean,
    `enhance` Boolean,
    `private` Boolean,
    `nofeed` Boolean,
    `is_child` Boolean,
    `is_mature` Boolean,
    `was_transformed` Boolean,
    `cache_status` String,
    `referrer` String,
    
    -- Metadata and error handling
    `proxy_metadata` String,
    `exception` String,
    `traceback` String

ENGINE = MergeTree()
ENGINE_PARTITION_KEY = toYYYYMM(start_time)
ENGINE_SORTING_KEY = (service_type, start_time, user)
```

## 3. Image Service Integration

### 3.1 Update image.pollinations.ai/src/index.js

Add imports and integrate tracking:

```javascript
import { sendTinybirdEvent } from '../../shared/observability/tinybirdTracker.js';

// In the imageGen function:
const imageGen = async ({ req, timingInfo, originalPrompt, safeParams, referrer, progress, requestId }) => {
    const startTime = new Date();
    const ip = getIp(req);
    let userInfo = {};
    
    try {
        // Get user info if authenticated
        const authResult = await handleAuthentication(req);
        userInfo = authResult || {};
        
        // ... existing image generation logic ...
        
        // Track successful generation (fire-and-forget)
        sendTinybirdEvent({
            requestId,
            startTime,
            endTime: new Date(),
            duration: Date.now() - startTime.getTime(),
            status: 'success',
            eventType: 'image_generation',
            model: safeParams.model,
            prompt: originalPrompt,
            width: safeParams.width,
            height: safeParams.height,
            seed: safeParams.seed,
            steps: safeParams.steps,
            guidance: safeParams.guidance,
            nologo: safeParams.nologo,
            enhance: safeParams.enhance,
            private: safeParams.private,
            nofeed: safeParams.nofeed,
            referrer,
            user: userInfo.userId,
            username: userInfo.username,
            tier: userInfo.tier,
            is_child: bufferAndMaturity.isChild,
            is_mature: bufferAndMaturity.isMature,
            was_transformed: wasTransformedForBadDomain,
            cache_status: 'miss'
        }, 'image').catch(err => {
            logError('Failed to send telemetry:', err);
        });
        
        // ... rest of function
        
    } catch (error) {
        // Track failed generation
        sendTinybirdEvent({
            requestId,
            startTime,
            endTime: new Date(),
            duration: Date.now() - startTime.getTime(),
            status: 'error',
            eventType: 'image_generation_error',
            model: safeParams?.model,
            prompt: originalPrompt,
            error,
            referrer,
            user: userInfo.userId,
            username: userInfo.username,
            tier: userInfo.tier
        }, 'image').catch(err => {
            logError('Failed to send error telemetry:', err);
        });
        
        throw error;
    }
};
```

### 3.2 Track Cache Hits
In the `checkCacheAndGenerate` function, add tracking for cache hits:

```javascript
// When serving from cache
if (cachedImage) {
    sendTinybirdEvent({
        requestId,
        startTime: new Date(),
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        status: 'success',
        eventType: 'image_served_from_cache',
        model: safeParams.model,
        prompt: originalPrompt,
        cache_status: 'hit',
        user: userInfo.userId,
        username: userInfo.username,
        tier: userInfo.tier
    }, 'image').catch(err => {
        logError('Failed to send cache telemetry:', err);
    });
}
```

### 3.3 Track Content Violations
Add tracking when content is flagged:

```javascript
// When content violation is detected
if (isChild || isMature) {
    sendTinybirdEvent({
        requestId,
        startTime: new Date(),
        endTime: new Date(),
        status: 'content_violation',
        eventType: 'content_flagged',
        model: safeParams.model,
        prompt: originalPrompt,
        is_child: isChild,
        is_mature: isMature,
        user: userInfo.userId,
        username: userInfo.username,
        tier: userInfo.tier
    }, 'image').catch(err => {
        logError('Failed to send content violation telemetry:', err);
    });
}
```

## 4. Environment Configuration

### 4.1 Update shared/.env.example
```bash
# Tinybird Configuration
TINYBIRD_API_URL=https://api.europe-west2.gcp.tinybird.co
TINYBIRD_API_KEY=your_tinybird_api_key_here
```

### 4.2 Ensure env-loader.js is used
The shared tinybird tracker should use the shared env loader to ensure consistent environment variable loading.

## 5. Implementation Phases

### Phase 1: Infrastructure Setup (Day 1)
- [ ] Create `shared/observability/` directory
- [ ] Move and refactor tinybirdTracker.js to shared location
- [ ] Update all imports in text.pollinations.ai
- [ ] Test existing text tracking continues to work

### Phase 2: Schema Updates (Day 2)
- [ ] Design and create unified Tinybird schema
- [ ] Create new data source in Tinybird
- [ ] Test data ingestion with sample events
- [ ] Create basic Tinybird pipes for analysis

### Phase 3: Image Service Integration (Day 3-4)
- [ ] Add tracking imports to image service
- [ ] Implement tracking at key points:
  - [ ] Request start
  - [ ] Generation success
  - [ ] Generation failure
  - [ ] Cache hits
  - [ ] Content violations
- [ ] Add error handling and logging

### Phase 4: Testing & Validation (Day 5)
- [ ] Test both text and image tracking
- [ ] Verify data appears correctly in Tinybird
- [ ] Check performance impact
- [ ] Create monitoring dashboards

### Phase 5: Deployment (Day 6)
- [ ] Deploy to staging environment
- [ ] Monitor for 24 hours
- [ ] Deploy to production
- [ ] Create alerts for anomalies

## 6. Performance Considerations

1. **Fire-and-forget pattern**: Don't await telemetry calls in critical paths
2. **Timeouts**: Use 5-second timeout for all telemetry requests
3. **Batching**: Consider implementing batching for high-volume scenarios
4. **Circuit breaker**: Add circuit breaker pattern if Tinybird is down

## 7. Privacy & Security

1. **Private prompts**: Replace with '[PRIVATE]' when private flag is set
2. **User data**: Only log user ID and username, no PII
3. **Error messages**: Sanitize error messages before logging
4. **IP addresses**: Don't log IP addresses in telemetry

## 8. Monitoring & Alerts

Create Tinybird pipes for:
- Request volume by service type
- Error rates by model and service
- Cache hit rates for images
- User tier distribution
- Content violation rates
- P95 response times

## 9. Future Enhancements

1. **Cloudflare Worker Tracking**: Add telemetry to the cloudflare-cache worker
2. **End-to-end tracing**: Implement trace IDs across services
3. **Cost tracking**: Add cost estimation for image generation
4. **A/B testing**: Track experiment variations
5. **User journey**: Track complete user flows across services

## 10. Success Metrics

- All image requests are tracked with <1% data loss
- Telemetry adds <10ms latency to requests
- Zero impact on service availability
- Unified view of text and image service metrics
- Actionable insights for optimization

## Notes

- Follow the "thin proxy" design principle throughout
- Leverage existing shared utilities (env-loader, auth-utils)
- Maintain backward compatibility with existing text tracking
- Use debug logging extensively for troubleshooting
