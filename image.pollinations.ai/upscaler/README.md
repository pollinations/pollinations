# Real-ESRGAN Image Upscaler API

## 📌 Overview
This is a **Flask-based API** for upscaling images using Real-ESRGAN. The API accepts images either via **direct file upload** or **URL**, processes them in memory, and returns an upscaled image.

## 🚀 Features
- Accepts images via **direct upload** (`multipart/form-data`) or **URL** (`image_url` parameter)
- Uses **Real-ESRGAN** for high-quality upscaling
- Processes images in memory **without saving to disk**
- Supports **PNG, JPG, JPEG** formats

## 🛠 Configuration
Ensure you have the **Real-ESRGAN model** file (`RealESRGAN_x4plus.pth`) in your working directory. If needed, download it from:

🔗 [Real-ESRGAN GitHub](https://github.com/xinntao/Real-ESRGAN)
`note file name can change based on the version being downloaded`

## ▶️ Running the Server
```sh
python app.py
```
The server will start on **`http://0.0.0.0:5000`**

## 📡 API Endpoints

### **1️⃣ Upscale Image**
#### **POST** `/upscale`
**Request Parameters:**
- `image_url` (optional): URL of the image to upscale
- `image` (optional): Directly uploaded image file

#### **Example Usage:**
##### **Using an Image URL**
```sh
curl -X POST "http://localhost:5000/upscale" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "image_url=https://example.com/sample.jpg"
```

##### **Uploading an Image**
```sh
curl -X POST "http://localhost:5000/upscale" \
     -F "image=@/path/to/image.jpg"
```

#### **Response Example:**
```json
{
  "message": "Upscaling complete!",
  "upscaled_image_url": "https://cloudflare-hosted-pollinations-server/output.png",
  "processing_time": "2.34 sec"
}
```

## 🏗 Deployment
To deploy using **Docker**, create a `Dockerfile` with:
```dockerfile
FROM python:3.9
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
```

### **Run Docker Container**
```sh
docker build -t upscaler-api .
docker run -p 5000:5000 upscaler-api
```

## 🤝 Contribution
Feel free to fork this repo, submit PRs, or suggest improvements!

---
### **🔗 Credits**
- Built with **Flask** & **Real-ESRGAN**
- Model from [Real-ESRGAN GitHub](https://github.com/xinntao/Real-ESRGAN)

