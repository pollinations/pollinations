# Unified Observability Implementation Plan

**Related Issue:** [#2468 - Log image requests to Tinybird](https://github.com/pollinations/pollinations/issues/2468)

## 1. Objective
Implement a unified observability layer that captures telemetry for both text and image generation events, sending them to Tinybird for holistic monitoring while adhering to DRY principles.

## 2. Implementation Steps

### Phase 1: Shared Observability Module
1. **Create shared module**
   - Location: `shared/observability/tracker.js`
   - Features:
     - Unified event schema for text/image events
     - Cost calculation for both token-based and image-based pricing
     - Async Tinybird submission with timeout handling

2. **Refactor text service integration**
   - Update `text.pollinations.ai/server.js` to use shared module
   - Pass `eventType: 'text'` with existing event data

3. **Implement image service integration**
   - Instrument `image.pollinations.ai/src/createAndReturnImages.js`:
   ```javascript
   import { sendTinybirdEvent } from '../../shared/observability/tracker.js';
   
   const startTime = new Date();
   // ... image generation logic ...
   const endTime = new Date();
   
   await sendTinybirdEvent('image', {
     startTime,
     endTime,
     model: requestBody.model,
     imageCount: requestBody.n || 1,
     size: requestBody.size || '1024x1024',
     requestId: uniqueRequestId,
     user: authenticatedUserId
   });
   ```

### Phase 2: Schema Enhancement
1. **Extend Tinybird schema**
   ```sql
   ALTER TABLE llm_events
   ADD COLUMN `event_type` String,
   ADD COLUMN `data` JSON
   ```

2. **Create materialized views**
   - `text_events_view`: `SELECT * FROM llm_events WHERE event_type = 'text'`
   - `image_events_view`: `SELECT * FROM llm_events WHERE event_type = 'image'`

### Phase 3: Pricing Model Integration
1. **Extend availableModels.js**
   - Add image generation pricing:
   ```javascript
   {
     name: 'dall-e-3',
     provider: 'openai',
     pricing: {
       per_image: 0.04 // $0.04 per image
     }
   }
   ```

### Phase 4: Testing & Validation
1. **Unit tests**
   - Cost calculation tests for text and image events
   - Schema validation tests

2. **Integration tests**
   - Verify text events appear in Tinybird
   - Verify image events appear in Tinybird
   - Validate combined cost reporting

## 3. Monitoring & Alerting
1. **Create Tinybird dashboards**
   - Real-time request volume
   - Cost by service/user/model
   - Error rate monitoring

2. **Set up alerts**
   - Unusual cost spikes
   - Service degradation
   - Data pipeline failures

## 4. Deployment Plan
1. **Canary rollout**
   - Phase 1: Deploy shared module
   - Phase 2: Enable text service integration
   - Phase 3: Enable image service integration

2. **Rollback procedure**
   - Feature flags for observability
   - Fallback to legacy tracking

## 5. Documentation
1. **Developer guide**
   - How to add new event types
   - Cost model configuration

2. **Operations manual**
   - Interpreting dashboards
   - Responding to alerts

## 6. Timeline
| Phase | Duration | Target Date |
|-------|----------|-------------|
| Shared Module | 2 days | MM-DD |
| Service Integration | 3 days | MM-DD |
| Testing | 2 days | MM-DD |
| Deployment | 1 day | MM-DD |

## 7. Team Responsibilities
| Role | Responsibilities |
|------|-----------------|
| Backend | Module development, service integration |
| Data Engineer | Tinybird schema, dashboards |
| QA Engineer | Test planning & execution |
| DevOps | Deployment coordination |

This plan provides a clear roadmap for implementing unified observability across text and image services.
