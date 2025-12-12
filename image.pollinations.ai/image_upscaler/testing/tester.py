import base64
import os
import requests

API_URL = "http://localhost:8000/upscale"
IMAGE_PATH = "output.jpg"

def test_upscale_endpoint():
    if not os.path.exists(IMAGE_PATH):
        print(f"Test image '{IMAGE_PATH}' not found.")
        return

    # Read and encode the image as base64
    with open(IMAGE_PATH, "rb") as img_file:
        image_b64 = base64.b64encode(img_file.read()).decode()

    payload = {
        "image_b64": image_b64,
        "target_resolution": "4k",
        "enhance_faces": True
    }

    print("Sending request to /upscale endpoint...")
    try:
        response = requests.post(API_URL, json=payload, timeout=120)
        print(f"Status code: {response.status_code}")
        data = response.json()
        print("Response JSON:")
        for k, v in data.items():
            if k == "base64":
                print(f"{k}: [base64 string, length={len(v)}]")
            else:
                print(f"{k}: {v}")
        # Optionally save the upscaled image
        if data.get("base64"):
            with open("upscaled_from_api.jpg", "wb") as f:
                f.write(base64.b64decode(data["base64"]))
            print("Upscaled image saved as upscaled_from_api.jpg")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_upscale_endpoint()
