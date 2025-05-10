'''
This is a test file which is just a rerference to how ASCII-ANSI art can be reproduced from any picture on a CPU based instance based on Pollinations.ai API, and can be 
directly integrated with the system with &ascii=true in the GET Request, the gradients can be trailed and tested for the best choice, my personal fav is GRADIENTS['256']. 
Please take a look into this and we an then create and expand ascii-art styled prompts into the pollinations api.
'''

import requests
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os

GRADIENT = "abcdefgh" 

# GRADIENTS = {
#     'LD': " ░▒▓█",
#     'SD': " ░▒▓▓█▒▓█▓▒▓█▓▓▒▒▒▒▓▒",
#     'HD': "⣿▒▒▓▓█▓▓▒▒▒▒▓▓██▓▓▒▒▓▓█▒▒▓▓▒▒▒▒▓▓▓▒▒▓▓",
#     'XHD': "⢿⠿⣿▒▒▓▓▓▒▒▓▓▒▒▓▒▒▓▓██▓▓▒▒▒▒██▒▒▓▓▒▒▓▓█▒▒▓▓▒▒▓▓▒▒",
#     '1': " ░▒▒▓▓█@#$%&*+=-.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
#     '2': " ░▒▓█@#$%&*^()_+`-={}[]|:;\"'<>,.?/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
#     '3': "▒▒▓▓▓▒▒▓▓▒▒▓▒▒▓▓██▓▓▒▒▒▒██▒▒▓▓▒▒▓▓█▒▒▓▓▒▒▓▓▒▒@#$%&*^()_+`-={}[]|:;\"'<>,.?/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789⠁⠃⠇⠧⠷⠿⡿⣟⣯⣷⣿⣿⣿⣿"
#     '4': "" abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=-:. \n ⠁⠃⠇⠧⠷⠿⡿⣟⣯⣷⣿⣿⣿⣿"
#     '5': " abcdefgh", 
#     '256' : "⠁⠃⠇⠧⠷⠿⡿⣟⣯⣷⣿⣿⣿⣿"

# }


def fetch_image(prompt: str, size=256) -> np.ndarray:
    print(f"[+] Generating image for: '{prompt}' ...")
    seed = np.random.randint(1000, 100000)
    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)}?height={size}&width={seed}&seed=23&nologo=true"
    response = requests.get(url, stream=True)
    if response.status_code != 200:
        raise Exception("[-] Failed to fetch image.")

    image_path = "temp_img.jpg"
    with open(image_path, "wb") as f:
        for chunk in response.iter_content(1024):
            f.write(chunk)

    image = cv2.imread(image_path)
    os.remove(image_path)
    return image

def image_to_colored_ascii_image(img, width=320, font_size=6, output="ascii_output_colored.png"):
    h, w = img.shape[:2]
    aspect_ratio = w / h
    new_height = int(width / aspect_ratio * 0.55)
    resized = cv2.resize(img, (width, new_height), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    color = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

    ascii_chars = GRADIENT
    grad_len = len(ascii_chars)

    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", font_size)
    except:
        font = ImageFont.load_default()

    bbox = font.getbbox("A")
    char_width, char_height = bbox[2] - bbox[0], bbox[3] - bbox[1]

    img_width = char_width * width
    img_height = char_height * new_height

    output_img = Image.new("RGB", (img_width, img_height), color=(0, 0, 0))
    draw = ImageDraw.Draw(output_img)

    for y in range(new_height):
        for x in range(width):
            brightness = gray[y, x] / 255.0
            index = int(brightness * (grad_len - 1))
            char = ascii_chars[index]
            r, g, b = color[y, x]
            draw.text((x * char_width, y * char_height), char, font=font, fill=(r, g, b))

    output_img.save(output)
    print(f"[+] High-resolution colored ASCII image saved to {output}")

def main():
    prompt = "a cat swimming in the ocean"
    image = fetch_image(prompt)
    image_to_colored_ascii_image(image, width=320, font_size=16)

if __name__ == "__main__":
    main()
