### **Unified Observability Layer Implementation Plan**

**Related Issue:** [#2468 - Log image requests to Tinybird](https://github.com/pollinations/pollinations/issues/2468)

### **1. Objective**

To implement a unified, shared observability module that captures telemetry for both text and image generation events and sends them to dedicated Tinybird data sources. This will provide a holistic view of platform usage, costs, and performance, while adhering to the DRY (Don't Repeat Yourself) principle.

### **2. Implementation Phases**

#### **Phase 1: Create a Shared Observability Module**

1.  **Create New Directory and File:**
    *   A new directory will be created at: `shared/observability/`
    *   A new file will be created inside it: `shared/observability/tracker.js`

2.  **Develop the Generic `trackEvent` Function:**
    *   The core logic from `text.pollinations.ai/observability/tinybirdTracker.js` will be moved to the new shared file.
    *   A new, exported primary function `trackEvent(eventType, eventData)` will be created.
    *   `eventType` (string): Will determine the event schema and Tinybird endpoint. Initially `'text_generation'` or `'image_generation'`.
    *   `eventData` (object): A payload containing all the relevant data for the event.

#### **Phase 2: Define Event Schemas & Logic**

The `trackEvent` function will internally handle two different schemas based on `eventType`.

1.  **Text Generation (`eventType: 'text_generation'`)**
    *   **Tinybird Datasource:** `llm_events` (existing)
    *   **Schema:** The payload will be constructed similarly to the existing `tinybirdTracker.js`, including:
        *   `model`, `provider`
        *   `cost` (calculated based on `prompt_tokens` and `completion_tokens`)
        *   `usage` (token counts)
        *   `user`, `username`, `tier`
        *   `duration`, `status`, `error`

2.  **Image Generation (`eventType: 'image_generation'`)**
    *   **Tinybird Datasource:** `image_events` (new)
    *   **Schema:** A new payload structure will be defined for images:
        *   `model`, `provider`
        *   `cost` (calculated on a per-image basis, requires adding pricing info to image models)
        *   `image_size`, `num_images`
        *   `user`, `username`, `tier`
        *   `duration`, `status`, `error`

#### **Phase 3: Integrate Tracker into `image.pollinations.ai`**

1.  **Target File:** `image.pollinations.ai/src/createAndReturnImages.js`
2.  **Target Function:** `createAndReturnImageCached`
3.  **Implementation Steps:**
    *   Import `trackEvent` from the new `shared/observability/tracker.js`.
    *   In `createAndReturnImageCached`, wrap the entire logic in a `try...catch...finally` block.
    *   Record a `startTime` at the beginning of the `try` block.
    *   In the `finally` block:
        *   Calculate the total `duration`.
        *   Construct the `eventData` object for the image generation event, including status (success/error), user info, model details, and the error object if one was caught.
        *   Call `await trackEvent('image_generation', eventData)`.

#### **Phase 4: Refactor `text.pollinations.ai` to Use the Shared Tracker**

1.  **Target Files:** All files in `text.pollinations.ai` that currently import and use `sendTinybirdEvent`.
2.  **Implementation Steps:**
    *   Change the import path from `../observability/tinybirdTracker.js` to the new `shared/observability/tracker.js`.
    *   Replace all calls to `sendTinybirdEvent(eventData)` with `trackEvent('text_generation', eventData)`.

#### **Phase 5: Cleanup**

1.  **Delete Redundant Files:**
    *   Once the integrations are complete and tested, delete the old tracker: `text.pollinations.ai/observability/tinybirdTracker.js`.
    *   Delete the local file-based logger, as it's now superseded by the Tinybird integration: `image.pollinations.ai/src/utils/gptImageLogger.js`.
