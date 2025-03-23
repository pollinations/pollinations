import os
import torch
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from transformers import pipeline
from PIL import Image
from io import BytesIO

# Initialize FastAPI app
app = FastAPI()

# Load the background removal model
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
pipe = pipeline("image-segmentation", model="briaai/RMBG-1.4", trust_remote_code=True, device=0 if DEVICE == "cuda" else -1)

@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)):
    try:
        # Ensure the file is an image
        if file.content_type not in ["image/png", "image/jpeg"]:
            raise HTTPException(status_code=400, detail="Invalid image format. Only PNG and JPEG are supported.")
        
        # Read image
        image_bytes = await file.read()
        image = Image.open(BytesIO(image_bytes)).convert("RGBA")
        
        # Process image through model
        result = pipe(image)
        
        # Convert result to an image
        output_img = result[0]['mask']  # Assuming the model returns an RGBA mask
        
        # Convert to BytesIO for response
        output_buffer = BytesIO()
        output_img.save(output_buffer, format="PNG")
        output_buffer.seek(0)
        
        return {
            "message": "Background removed successfully!",
            "image_data": output_buffer.getvalue()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
