# Image Transparency Service

This service provides an API for removing the background from images using a pre-trained image segmentation model. It is built with FastAPI and uses the `transformers` library for model inference.

## Features

- **Background Removal**: Removes the background from PNG and JPEG images.
- **FastAPI Integration**: Provides a RESTful API for easy integration.
- **GPU Support**: Automatically utilizes GPU if available for faster processing.



# Project Folder Structure
```
📦 image_transparency_service
 ┣ 📂 safety_checker
 ┃ ┣ 📜 .gitignore
 ┃ ┣ 📜 censor.py
 ┃ ┣ 📜 install.py
 ┃ ┣ 📜 README.md
 ┃ ┗ 📜 safety_checker.py
 ┣ 📂 src
 ┃ ┣ 📂 services
 ┃ ┃ ┗ 📜 modal_service.py
 ┃ ┣ 📂 utils
 ┃ ┃ ┗ 📜 image_processing.py
 ┃ ┗ 📜 app.py
 ┣ 📜 .gitignore
 ┣ 📜 cog.yaml
 ┣ 📜 Dockerfile
 ┣ 📜 README.md
 ┗ 📜 requirements.txt

```


## Installation

### Prerequisites

- Python 3.12 or higher
- Docker (optional, for containerized deployment)

### Local Setup

1. Clone the repository and navigate to the `image_transparency_service` folder:

   ```bash
   git clone https://github.com/your-repo/image_transparency_service.git
   cd image_transparency_service
   ```

2. Install dependencies: 
```bash
pip install -r requirements.txt
```

3. Run the service:- 
```bash
python src/app.py
```

### CURL 
```bash
curl -X POST "http://localhost:8000/remove-background" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@example.jpg"
```

### API Endpoints

`POST /remove-background`
Removes the background from an uploaded image.

#### Request
 - **Content-Type**: multipart/form-data
 - **Body**: An image file (image/png or image/jpeg)