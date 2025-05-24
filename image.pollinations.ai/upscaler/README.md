# Real-ESRGAN Image Upscaler (Modal.com)

This project provides an **AI-powered image upscaler** using **Real-ESRGAN**.  
It runs **serverlessly on Modal.com**, scaling GPU resources automatically.

## 🚀 Features
- **AI-powered upscaling** (1x - 4x)
- **Auto-scaled GPU execution**
- **Accepts image URLs for processing**
- **Runs on demand (serverless) to save costs**

## 📌 Setup & Deployment

### 1️⃣ Install Dependencies
Make sure you have **Modal CLI** installed:
```sh
pip install modal
```
### 2️⃣ Run Locally (for Testing) sh CopyEdi
```sh
modal run modal_upscaler.upscale_request
```

### 3️⃣ Deploy to Modal Cloud
```sh
modal deploy
```

### 🎯 Usage
You can send a request to the deployed API:

```sh
curl -X POST "https://your-modal-endpoint.com/upscale_request" \
    -d '{
         "image_url": "https://example.com/image.jpg",
         "upscale_value": 4
        }' \
    -H "Content-Type: application/json"
```

### 🔧 Configuration
- Upscale Value: Supports `1x` to `4x` scaling.
- Image Input: Accepts direct URLs.

### 🛠️ Powered by:
- *[Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)*
- *[Modal.com (Serverless GPU)](https://modal.com/)*


---

## 🎯 Overview
This plan outlines how to integrate **Real-ESRGAN upscaling** into Pollinations' **Image API**.

## ✅ Proposed Changes

1️⃣ **New Query Parameters for Existing Image API**
   - `&upscale=true` → Enables AI upscaling  
   - `&upscaleValue=1-4` → Specifies upscale factor  

2️⃣ **New Standalone Upscale API**
   - A separate API **only for upscaling images**
   - Accepts **direct image upload** (<5MB) or **image URLs**
   - Uses **serverless GPUs (Modal.com) for scaling**

## 🛠️ API Design

### 🔹 **Option 1: Integrate into Existing API**
```sh
GET /?prompt=cat&upscale=true&upscaleValue=4
```

### 🚀 Deployment
- Hosted on Modal.com for auto-scaling GPU execution.
- No manual server maintenance required.


---

### 🔥 **Final Deliverables (PR DETAILS)**
| File Name         | Purpose |
|------------------|---------|
| `modal_upscaler.py` | Main upscaler code for Modal |
| `requirements.txt` | Dependencies list |
| `README.md` | Usage instructions & API docs |

---




