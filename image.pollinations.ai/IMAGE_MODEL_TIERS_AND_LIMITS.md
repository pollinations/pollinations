# Image Models - Tiers and Limits

## Overview

The Pollinations image service has different tier requirements and concurrency limits for each model. This document outlines all the requirements and limits.

---

## 🎨 Available Models

| Model | Provider | Tier Required | Max Resolution | Enhance | Concurrency Limits |
|-------|----------|---------------|----------------|---------|-------------------|
| **flux** | Pollinations | seed | 768x768 | ✅ Yes | Standard |
| **kontext** | Azure Flux | seed | 1024x1024 | ✅ Yes | Standard |
| **turbo** | Pollinations | seed | 768x768 | ✅ Yes | Standard |
| **gptimage** | Azure GPT | seed | 1024x1024 | ❌ No | Standard |
| **nanobanana** | Vertex AI Gemini | flower | 1024x1024 | ❌ No | Stricter |
| **seedream** | ByteDance ARK | Priority Users Only | 2048x2048 | ❌ No | Strictest |

---

## 🎫 Tier System

### Tier Hierarchy (Lowest to Highest)
1. **anonymous** - No authentication
2. **seed** - Basic authentication (token or referrer)
3. **flower** - Mid-tier authentication
4. **nectar** - Premium tier

### How to Get Tiers
- **seed tier**: Get a token at https://auth.pollinations.ai
- **flower tier**: Upgrade your account
- **nectar tier**: Premium subscription

---

## ⚡ Concurrency Limits

### Standard Models (flux, kontext, turbo, gptimage)

| Tier | Concurrent Requests | Interval |
|------|---------------------|----------|
| anonymous | 1 | 6 seconds |
| seed | 3 | 6 seconds |
| flower | 7 | 6 seconds |
| nectar | 50 | 6 seconds |

**Models using standard limits:**
- flux
- kontext
- turbo
- gptimage

---

### Nanobanana Model (STRICTER LIMITS)

| Tier | Concurrent Requests | Interval | Notes |
|------|---------------------|----------|-------|
| anonymous | 1 | 120 seconds | Not accessible (requires flower tier) |
| seed | 1 | 120 seconds | Not accessible (requires flower tier) |
| flower | 1 | 120 seconds | Base level |
| nectar | 2 | 120 seconds | Enhanced limit |

**Special Features:**
- ⏱️ **120-second interval** (2 minutes between requests)
- 🔒 **Requires flower tier minimum**
- 🎯 **Stricter limits** due to Vertex AI costs
- 👥 **Priority users** can get custom limits (see below)

---

### Seedream Model (STRICTEST LIMITS)

| Tier | Concurrent Requests | Interval | Notes |
|------|---------------------|----------|-------|
| anonymous | 1 | 120 seconds | Not accessible (priority users only) |
| seed | 1 | 120 seconds | Not accessible (priority users only) |
| flower | 1 | 120 seconds | Not accessible (priority users only) |
| nectar | 2 | 120 seconds | Not accessible (priority users only) |

**Special Features:**
- 🔒 **Priority users only** - Not available to general public
- ⏱️ **120-second interval** (2 minutes between requests)
- 🎯 **Lowest limits** of all models
- 👥 **Priority users** can get custom limits (see below)
- 💎 **Highest quality** - 2048x2048 resolution, supports up to 4K

**Note:** Currently commented out in models.ts (not active)

---

## 👑 Priority Users System

### What is Priority Users?

Priority users can bypass the standard tier-based limits for **nanobanana** and **seedream** models and get custom concurrency limits.

### Configuration

Set via `PRIORITY_MODEL_USERS` environment variable:

```bash
# Format: username1:limit1,username2:limit2,username3
PRIORITY_MODEL_USERS="d-Dice,Itachi-1824,Circuit-Overtime,thomashmyceli:10,helpurselfreturn,SenhorEgonss"
```

### Syntax

- **Without limit**: `username` → Gets default 5 concurrent requests
- **With limit**: `username:10` → Gets 10 concurrent requests

### Current Priority Users

| Username | Custom Limit | Default Limit |
|----------|--------------|---------------|
| d-Dice | - | 5 |
| Itachi-1824 | - | 5 |
| Circuit-Overtime | - | 5 |
| thomashmyceli | 10 | - |
| helpurselfreturn | - | 5 |
| SenhorEgonss | - | 5 |

### How Priority Users Work

1. **Check priority list first** - If user is in the list, use their custom limit
2. **Otherwise use tier caps** - Fall back to standard tier-based limits
3. **Applies to nanobanana and seedream only** - Other models use standard limits

---

## 📊 Model Comparison

### By Tier Requirement

**Seed Tier (Easiest Access):**
- flux
- kontext
- turbo
- gptimage

**Flower Tier (Mid-Level):**
- nanobanana

**Priority Users Only (Restricted):**
- seedream

### By Resolution

| Resolution | Models |
|------------|--------|
| 768x768 | flux, turbo |
| 1024x1024 | kontext, gptimage, nanobanana |
| 2048x2048 | seedream |

### By Features

**Prompt Enhancement:**
- ✅ flux, kontext, turbo

**Image Editing:**
- ✅ kontext, gptimage

**Highest Quality:**
- 💎 seedream (2048x2048, up to 4K)

---

## 🔐 Access Control Examples

### Example 1: Anonymous User
```
❌ flux - Blocked (requires seed tier)
❌ kontext - Blocked (requires seed tier)
❌ nanobanana - Blocked (requires flower tier)
❌ seedream - Blocked (priority users only)
```

### Example 2: Seed Tier User
```
✅ flux - 3 concurrent, 6s interval
✅ kontext - 3 concurrent, 6s interval
✅ turbo - 3 concurrent, 6s interval
✅ gptimage - 3 concurrent, 6s interval
❌ nanobanana - Blocked (requires flower tier)
❌ seedream - Blocked (priority users only)
```

### Example 3: Flower Tier User
```
✅ flux - 7 concurrent, 6s interval
✅ kontext - 7 concurrent, 6s interval
✅ turbo - 7 concurrent, 6s interval
✅ gptimage - 7 concurrent, 6s interval
✅ nanobanana - 1 concurrent, 120s interval
❌ seedream - Blocked (priority users only)
```

### Example 4: Nectar Tier User
```
✅ flux - 50 concurrent, 6s interval
✅ kontext - 50 concurrent, 6s interval
✅ turbo - 50 concurrent, 6s interval
✅ gptimage - 50 concurrent, 6s interval
✅ nanobanana - 2 concurrent, 120s interval
❌ seedream - Blocked (priority users only)
```

### Example 5: Priority User (thomashmyceli)
```
✅ flux - 3 concurrent, 6s interval (seed tier)
✅ kontext - 3 concurrent, 6s interval (seed tier)
✅ turbo - 3 concurrent, 6s interval (seed tier)
✅ gptimage - 3 concurrent, 6s interval (seed tier)
✅ nanobanana - 10 concurrent, 120s interval (priority override!)
✅ seedream - 10 concurrent, 120s interval (priority access!)
```

---

## 🚨 Error Messages

### Insufficient Tier
```json
{
  "error": "Internal Server Error",
  "message": "Access to [model] is limited to users in the [tier] tier or higher. Please authenticate at https://auth.pollinations.ai"
}
```

### Priority Users Only
```json
{
  "error": "Internal Server Error",
  "message": "Access to seedream model is currently restricted to priority users only. Please contact support if you need access to this model."
}
```

### Queue Full
```json
{
  "error": "Queue full for user: [username] - [total] requests already queued (max: [maxQueueSize])"
}
```

---

## 📈 Queue Behavior

### Queue Size Limits
- **Max queue size** = `cap × 5`
- Example: If cap is 3, max queue size is 15

### Queue Management
- Requests are queued per IP address (or userId for authenticated users)
- Queue is FIFO (First In, First Out)
- Old queues are cleaned up periodically

### Interval Behavior
- **Standard models**: 6-second interval between requests
- **Nanobanana/Seedream**: 120-second interval (2 minutes)
- Interval enforced using p-queue's `intervalCap` feature

---

## 💰 Cost Considerations

### Why Different Limits?

**Standard Models (flux, kontext, turbo, gptimage):**
- Lower cost per request
- More generous limits
- 6-second intervals

**Nanobanana (Vertex AI Gemini):**
- Higher cost per request (~$0.03/image)
- Stricter limits to control costs
- 120-second intervals

**Seedream (ByteDance ARK):**
- Highest quality output
- Priority users only
- Strictest limits

---

## 🔧 Configuration Files

### Model Configuration
- **File**: `image.pollinations.ai/src/models.ts`
- **Defines**: Tier requirements, max resolution, enhance settings

### Queue Configuration
- **File**: `shared/ipQueue.js`
- **Defines**: Concurrency limits, intervals, priority users

### Environment Variables
```bash
# Priority users for nanobanana and seedream
PRIORITY_MODEL_USERS="user1:10,user2:5,user3"
```

---

## 📝 Summary

**Key Takeaways:**
1. Most models require **seed tier** minimum
2. **Nanobanana** requires **flower tier**
3. **Seedream** requires **priority user** status
4. Standard models: **3-50 concurrent** (depending on tier)
5. Nanobanana/Seedream: **1-2 concurrent** (stricter limits)
6. Priority users can get **custom limits** for restricted models
7. Intervals: **6 seconds** (standard) or **120 seconds** (restricted)

**To increase your limits:**
1. Authenticate to get seed tier (3 concurrent)
2. Upgrade to flower tier (7 concurrent, nanobanana access)
3. Upgrade to nectar tier (50 concurrent)
4. Request priority user status for nanobanana/seedream custom limits
