# Pollinations API Documentation Evaluation Report
## Abstract
This report evaluates the effectiveness of the current `APIDOCS.md` documentation for AI agent–driven application development using the Pollinations API. The documentation was tested against a concise technical version across five practical software use cases. The results indicate that while the current documentation is effective for human learning, it is suboptimal for AI code generation due to verbosity and lack of structured references. Recommendations are provided to improve API usability for both developers and AI systems.

---

# 1. Introduction

### Improving API Documentation for AI Agent Code Generation

---

## Table of Contents
1. Objective
2. Test Setup
3. Test Prompts
4. Results Summary
5. Observations
6. Recommendations
7. Future Work
8. Appendix (Raw Results)
---

# Pollinations API Docs Evaluation Report

**Project:** Hacktoberfest - Advanced: Evaluate APIDOCS.md for AI Agent App Generation
**Author:** @CloudCompile (CJ Hauser)
**Date:** 10/23/2025

---

## ✅ Objective
Evaluate how well AI agents can generate working applications using **Pollinations APIs** based on two documentation styles:

| Doc Version | Description |
|-------------|-------------|
| Technical Docs | Concise, structured, reference-first style |
| Current APIDOCS.md | Beginner-friendly with analogies and explanations |

Goal: Compare **which doc style is better for AI-generated coding accuracy**.

---

## 🔧 Test Setup
Five realistic Pollinations app use cases were used to simulate AI usage:

| # | Use Case |
|---|-----------|
| 1 | Image Generator Web App |
| 2 | Chatbot (text + image) |
| 3 | Story + Image App |
| 4 | Image-to-Image Transformer |
| 5 | Multi-Modal App (text + image + audio) |

---

## 🧪 Test Results Summary

| Prompt # | Use Case | Technical Docs Result | Current APIDOCS.md Result |
|-----------|----------|-----------------------|----------------------------|
| 1 | Image Generator | ✅ Success | ✅ success |
| 2 | Chatbot | ✅ Success | ✅ Success |
| 3 | Blog/Story App | ✅ Success | ❌ Failed |
| 4 | Image-to-Image | ⚠️ Partial (API error handling needed) | ❌ Failed |
| 5 | Multi-Modal | ❌ Failed (tier/API limits) | ⚠️ Partial |

**✅ Overall:** Technical docs enabled **better AI-generated code** with higher success and fewer mistakes.

---

## 📊 Success Rate

| Doc Type | Success Rate | Notes |
|----------|--------------|--------|
| Technical Docs | ⭐ 3.5 / 5 | Clear structure helped AI follow APIs |
| Current APIDOCS.md | ⭐ 2 / 5 | Too much narrative, AI got confused |

---

## 🔍 Observations

### ✅ Technical Docs Strengths
- AI used correct endpoints consistently
- Better URL parameter formatting
- Less hallucination of features

### ⚠️ Current Docs Issues
- Too much explanation—not enough examples
- Missing quick reference for endpoints
- AI misused `/text` vs `/prompt`
- Lacked copy-pasteable code snippets

---

## ✅ Recommendations
To improve AI + developer usability:

✅ Add **Quick Reference API Table** at top of docs  
✅ Provide **copy-paste code blocks** for each endpoint  
✅ Add **working JavaScript + Python examples**  
✅ Include **error handling templates**  
✅ Move analogies to "Learn More" section

---

## 🧩 Next Steps (Suggested)
- Build **ai-friendly-apidocs.md** version
- Add **Postman Collection** for easy testing
- Add examples for **streaming + real-time** usage

---

## 📎 Appendix: Raw Results
### ✅ Prompt 1 – Image Generator (Technical Docs)
- Result: Success
- Notes: Worked well, consistent output
- Code Details
  <details>
      <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Image Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f0f0f0;
        }
        .container {
            text-align: center;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        input[type="text"] {
            width: 300px;
            padding: 10px;
            margin: 10px 0;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        button {
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: #0056b3;
        }
        img {
            max-width: 100%;
            margin-top: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        </style>
        </head>
        <body>
        <div class="container">
        <h1>AI Image Generator</h1>
        <p>Enter a text prompt to generate an image using Pollinations.AI</p>
        <input type="text" id="prompt" placeholder="e.g., cat in sunglasses">
        <button onclick="generateImage()">Generate Image</button>
        <div>
            <img id="generatedImage" src="" alt="Generated Image" style="display: none;">
        </div>
    </div>

  <script>
        function generateImage() {
            const prompt = document.getElementById('prompt').value.trim();
            if (!prompt) {
                alert('Please enter a prompt!');
                return;
            }
            const imageElement = document.getElementById('generatedImage');
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
            imageElement.src = url;
            imageElement.style.display = 'block'; // Show the image once generated
        }
    </script>
    </body>
    </html>
</details>

- Screenshot:<img width="1363" height="619" alt="1" src="https://github.com/user-attachments/assets/85e403e6-0936-4abf-a362-28cccf740006" />


### ✅ Prompt 1 – Image Generator (Current Docs)
- Result: Success
- Notes: None, worked perfectly
- Code Details
  <details>
      <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Image Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }

        .container {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 100%;
            text-align: center;
        }

        h1 {
            margin-bottom: 20px;
            color: #333;
        }

        input[type="text"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
        }

        button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s;
        }

        button:hover {
            background-color: #45a049;
        }

        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }

        #image-container {
            margin-top: 20px;
        }

        #generated-image {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            display: none;
        }

        #loading {
            margin-top: 20px;
            font-style: italic;
            color: #666;
            display: none;
        }

        #error {
            margin-top: 20px;
            color: red;
            display: none;
        }
    </style>
    </head>
    <body>
    <div class="container">
        <h1>AI Image Generator</h1>
        <input type="text" id="prompt-input" placeholder="Enter your image prompt (e.g., 'a fluffy cat in space')">
        <button id="generate-button">Generate Image</button>
        <div id="loading">Generating image... Please wait.</div>
        <div id="error"></div>
        <div id="image-container">
            <img id="generated-image" alt="Generated AI Image">
        </div>
    </div>

    <script>
        const generateButton = document.getElementById('generate-button');
        const promptInput = document.getElementById('prompt-input');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const generatedImage = document.getElementById('generated-image');

        generateButton.addEventListener('click', async () => {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                error.textContent = 'Please enter a prompt.';
                error.style.display = 'block';
                return;
            }

            error.style.display = 'none';
            loading.style.display = 'block';
            generateButton.disabled = true;
            generatedImage.style.display = 'none';

            try {
                // Encode the prompt for the URL
                const encodedPrompt = encodeURIComponent(prompt);
                
                // Construct the API URL (using default model 'flux', 1024x1024)
                const apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&token=TOEAP3DuMvvVHUsy`;

                // Since the API returns the image directly, we can set it as img src
                // But to handle errors, we'll use fetch to check response
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`API error: ${response.statusText}`);
                }

                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                generatedImage.src = imageUrl;
                generatedImage.style.display = 'block';
            } catch (err) {
                error.textContent = `Failed to generate image: ${err.message}`;
                error.style.display = 'block';
            } finally {
                loading.style.display = 'none';
                generateButton.disabled = false;
            }
        });
    </script>
    </body>
    </html>

</details>

- Screenshot:<img width="1361" height="652" alt="Screenshot 2025-10-23 2 50 51 PM" src="https://github.com/user-attachments/assets/af13f169-724f-45af-bce9-540525db05c8" />



### ✅ Prompt 2 – Chatbot (Technical Docs)
- Result: Success
- Notes: Used correct endpoints and response handling
- Code Details
  <details>
    import requests
    import sys
    import urllib.parse

    def generate_text(prompt, model="openai"):
    """
    Generate text using Pollinations text generation API.
    """
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://text.pollinations.ai/{encoded_prompt}?model={model}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.text.strip()
    else:
        raise Exception(f"Text generation failed: {response.status_code} - {response.text}")

    def generate_image_prompt(question, answer):
    """
    Use text API to generate a relevant image prompt based on the question and answer.
    """
    meta_prompt = f"Create a concise, descriptive prompt (one sentence) for generating an AI image that visually illustrates the key concept from the answer to the         question: '{question}'. The answer was: '{answer[:200]}'."  # Truncate long answers
    return generate_text(meta_prompt)

    def generate_image(image_prompt, width=1024, height=1024, model="flux"):
    """
    Generate an image URL using Pollinations image generation API.
    The URL directly points to the generated image.
    """
    encoded_prompt = urllib.parse.quote(image_prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&model={model}"
    return url

    def main():
    print("Welcome to the Pollinations AI Chatbot!")
    print("Type your question and press Enter. Type 'exit' to quit.")
    
    while True:
        question = input("\nYou: ").strip()
        if question.lower() == 'exit':
            print("Goodbye!")
            sys.exit(0)
        
        try:
            # Generate answer using text API
            print("Generating answer...")
            answer = generate_text(question)
            
            # Generate relevant image prompt using text API
            print("Generating image prompt...")
            image_prompt = generate_image_prompt(question, answer)
            
            # Generate image URL
            print("Generating image...")
            image_url = generate_image(image_prompt)
            
            # Output the response
            print("\nChatbot Answer:")
            print(answer)
            print("\nRelevant AI-Generated Image URL:")
            print(image_url)
            print("\n(You can paste the URL into a browser to view the image.)")
        
        except Exception as e:
            print(f"Error: {str(e)}")

    if __name__ == "__main__":
    main()

</details>

- Screenshot: <img width="1361" height="652" alt="Screenshot 2025-10-23 2 55 28 PM" src="https://github.com/user-attachments/assets/a0446293-ce55-478e-8316-919420427ce0" />



### ✅ Prompt 2 – Chatbot (Current Docs)
- Result: Partial
- Notes: AI hallucinated being able to set a temperature for the openai model. Image generation worked fine.
- Code Details
  <details>
  import requests
    from urllib.parse import quote
    import sys
    import os

    # Function to generate text answer using Pollinations Text API
    def generate_answer(question, model="openai", temperature=0.7):
    encoded_prompt = quote(question)
    url = f"https://text.pollinations.ai/{encoded_prompt}"
    params = {
        "model": model,
        "temperature": temperature
    }
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        return response.text.strip()
    except requests.RequestException as e:
        print(f"Error generating text: {e}")
        return "Sorry, I couldn't generate an answer right now."

    # Function to generate a relevant image using Pollinations Image API
    def generate_image(prompt, model="flux", width=1024, height=1024):
    encoded_prompt = quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
    params = {
        "model": model,
        "width": width,
        "height": height,
        "nologo": "false"  # Set to "true" if you have an account to remove watermark
    }
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        # Save the image to a file
        image_filename = "generated_image.jpg"
        with open(image_filename, "wb") as f:
            f.write(response.content)
        return os.path.abspath(image_filename)
    except requests.RequestException as e:
        print(f"Error generating image: {e}")
        return None

    # Simple command-line chatbot
    def run_chatbot():
    print("Welcome to the Pollinations AI Chatbot! Ask me anything.")
    print("Type 'exit' to quit.\n")
    
        while True:
        # Get user input
        question = input("You: ").strip()
        if question.lower() == "exit":
            print("Goodbye!")
            sys.exit(0)
        
        if not question:
            print("Please ask a question.")
            continue
        
        # Generate text answer
        print("\nThinking...")
        answer = generate_answer(question)
        print(f"AI: {answer}\n")
        
        # Generate a relevant image based on the question (or refine based on answer if needed)
        image_prompt = f"Illustration of {question}"  # Simple way to make image relevant
        print("Generating a relevant image...")
        image_path = generate_image(image_prompt)
        
        if image_path:
            print(f"Relevant Image saved at: {image_path}")
            print("You can open this file to view the image.\n")
        else:
            print("Couldn't generate an image.\n")

    # Run the chatbot
    if __name__ == "__main__":
    run_chatbot()

</details>

- Screenshot: <img width="1361" height="652" alt="image" src="https://github.com/user-attachments/assets/b2afcc82-efee-4423-ada9-b8b0f9c5623d" />



### ✅ Prompt 3 – Story + Image App (Technical Docs)
- Result: Success
- Notes: Generated text correctly but image was generated with the basic description of the story but not the setting.
- Code Details
  <details>
  <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Story Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f0f0f0;
        }
        h1 {
            text-align: center;
        }
        #prompt-input {
            width: 100%;
            padding: 10px;
            margin-bottom: 10px;
            font-size: 16px;
        }
        #generate-btn {
            display: block;
            width: 100%;
            padding: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }
        #generate-btn:hover {
            background-color: #45a049;
        }
        #output {
            margin-top: 20px;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        #story-text {
            white-space: pre-wrap;
            margin-bottom: 20px;
        }
        #story-image {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        #loading {
            text-align: center;
            font-style: italic;
            color: #666;
            display: none;
        }
    </style>
    </head>
    <body>
    <h1>AI Story Generator</h1>
    <p>Enter a prompt (e.g., "A cat in space adventure") to generate a short story snippet and a matching image using Pollinations.AI.</p>
    <input type="text" id="prompt-input" placeholder="Enter your prompt here...">
    <button id="generate-btn">Generate</button>
    <div id="loading">Generating...</div>
    <div id="output">
        <h2>Generated Story</h2>
        <div id="story-text"></div>
        <h2>Matching Image</h2>
        <img id="story-image" src="" alt="Generated Image">
    </div>

    <script>
        const generateBtn = document.getElementById('generate-btn');
        const promptInput = document.getElementById('prompt-input');
        const storyText = document.getElementById('story-text');
        const storyImage = document.getElementById('story-image');
        const loading = document.getElementById('loading');
        const output = document.getElementById('output');

        generateBtn.addEventListener('click', async () => {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                alert('Please enter a prompt!');
                return;
            }

            // Show loading and clear previous output
            loading.style.display = 'block';
            output.style.display = 'none';
            storyText.textContent = '';
            storyImage.src = '';
            storyImage.alt = '';

            try {
                // Generate text
                const textResponse = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=mistral&temperature=0.8`);
                if (!textResponse.ok) {
                    throw new Error('Text generation failed');
                }
                const text = await textResponse.text();
                storyText.textContent = text;

                // Generate image using the same prompt
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=800&height=600&nologo=true`;
                storyImage.src = imageUrl;
                storyImage.alt = `Image for: ${prompt}`;

                // Show output
                output.style.display = 'block';
            } catch (error) {
                console.error(error);
                alert('An error occurred while generating. Please try again.');
            } finally {
                loading.style.display = 'none';
            }
        });
    </script>
    </body>
    </html>

</details>

- Screenshot: <img width="1361" height="652" alt="Screenshot 2025-10-23 2 57 41 PM" src="https://github.com/user-attachments/assets/7b4071ee-4602-4bf5-8c3f-8bda89399e4a" />


### ✅ Prompt 3 – Story + Image App (Current Docs)
- Result: Failed
- Notes: AI hallucinated missing the temperature value again but when i opened the request URL it generated it properly.
- Code Details
  <details>
      <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Blog & Story Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #4CAF50;
        }
        form {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        label {
            display: block;
            margin-bottom: 10px;
            font-weight: bold;
        }
        input[type="text"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        select {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            width: 100%;
            padding: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        #loading {
            text-align: center;
            margin: 20px 0;
            font-style: italic;
            color: #666;
            display: none;
        }
        #result {
            margin-top: 30px;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: none;
        }
        #generated-text {
            margin-bottom: 20px;
            line-height: 1.6;
        }
        #generated-image {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        #error {
            color: red;
            text-align: center;
            margin: 20px 0;
            display: none;
        }
    </style>
    </head>
    <body>
    <h1>AI Blog Post & Story Snippet Generator</h1>
    <form id="generator-form">
        <label for="type">Select Type:</label>
        <select id="type">
            <option value="blog">Short Blog Post</option>
            <option value="story">Story Snippet</option>
        </select>
        
        <label for="topic">Enter Topic or Idea:</label>
        <input type="text" id="topic" placeholder="e.g., A magical forest adventure" required>
        
        <button type="submit">Generate</button>
    </form>
    
    <div id="loading">Generating content... Please wait.</div>
    <div id="error"></div>
    
    <div id="result">
        <h2>Generated Content</h2>
        <div id="generated-text"></div>
        <img id="generated-image" alt="Generated Image">
    </div>

    <script>
        const form = document.getElementById('generator-form');
        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');
        const result = document.getElementById('result');
        const generatedText = document.getElementById('generated-text');
        const generatedImage = document.getElementById('generated-image');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('type').value;
            const topic = document.getElementById('topic').value.trim();
            
            if (!topic) {
                errorDiv.textContent = 'Please enter a topic.';
                errorDiv.style.display = 'block';
                return;
            }
            
            errorDiv.style.display = 'none';
            loading.style.display = 'block';
            result.style.display = 'none';
            
            try {
                // Generate text
                const textPrompt = type === 'blog' 
                    ? `Write a short blog post about ${topic}, around 300 words. Make it engaging and informative.`
                    : `Write a short story snippet about ${topic}, around 300 words. Make it captivating and imaginative.`;
                
                const encodedTextPrompt = encodeURIComponent(textPrompt);
                const textUrl = `https://text.pollinations.ai/${encodedTextPrompt}?model=openai&temperature=1.0`;
                
                const textResponse = await fetch(textUrl);
                if (!textResponse.ok) throw new Error('Text generation failed.');
                const textContent = await textResponse.text();
                
                // Generate image based on the topic
                const imagePrompt = `A beautiful illustration representing ${topic}`;
                const encodedImagePrompt = encodeURIComponent(imagePrompt);
                const imageUrl = `https://image.pollinations.ai/prompt/${encodedImagePrompt}?model=flux&width=800&height=600&seed=42`;
                
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) throw new Error('Image generation failed.');
                const imageBlob = await imageResponse.blob();
                const imageObjectUrl = URL.createObjectURL(imageBlob);
                
                // Display results
                generatedText.innerHTML = textContent.replace(/\n/g, '<br>');
                generatedImage.src = imageObjectUrl;
                result.style.display = 'block';
            } catch (error) {
                errorDiv.textContent = `Error: ${error.message}. Please try again later.`;
                errorDiv.style.display = 'block';
            } finally {
                loading.style.display = 'none';
            }
        });
    </script>
    </body>
    </html>

</details>

- Screenshot: <img width="1365" height="652" alt="image" src="https://github.com/user-attachments/assets/0b2aa718-fa67-4c6e-bc0c-37c3f2db36a7" />



### ✅ Prompt 4 – Image-to-Image (Technical Docs)
- Result: Partial
- Notes: API call attempted but errors not handled
- Code Details
  <details>
  import streamlit as st
    import requests
    import base64
    from urllib.parse import quote

    st.title("Image Transformer using Pollinations.AI")

    st.write("Upload an image, enter a modification prompt, and generate a transformed image.")

    imgbb_api_key = st.text_input("ImgBB API Key (get one for free at https://api.imgbb.com/)", type="password")

    uploaded_file = st.file_uploader("Upload your image", type=["jpg", "jpeg", "png"])

    prompt = st.text_input("Enter style or modification prompt (e.g., 'in the style of Van Gogh')")

    if st.button("Transform Image") and uploaded_file and prompt and imgbb_api_key:
    with st.spinner("Uploading image and generating transformation..."):
        # Read and encode the uploaded file to base64
        file_bytes = uploaded_file.read()
        base64_image = base64.b64encode(file_bytes).decode("utf-8")

        # Upload to ImgBB
        upload_url = "https://api.imgbb.com/1/upload"
        payload = {
            "key": imgbb_api_key,
            "image": base64_image,
            "expiration": 600  # Expire after 10 minutes
        }
        upload_response = requests.post(upload_url, params=payload)

        if upload_response.status_code == 200:
            data = upload_response.json()["data"]
            image_url = data["url"]

            # Generate transformed image using Pollinations.AI
            pollinations_base = "https://image.pollinations.ai/prompt/"
            encoded_prompt = quote(prompt)
            encoded_image_url = quote(image_url)
            pollinations_url = f"{pollinations_base}{encoded_prompt}?model=kontext&image={encoded_image_url}&nologo=true&enhance=true&private=true"

            gen_response = requests.get(pollinations_url)

            if gen_response.status_code == 200:
                st.success("Transformation complete!")
                st.image(gen_response.content, caption="Transformed Image", use_column_width=True)
            else:
                st.error(f"Error generating image: {gen_response.status_code} - {gen_response.text}")
        else:
            st.error(f"Error uploading image to ImgBB: {upload_response.status_code} - {upload_response.text}")
    else:
    if not imgbb_api_key:
        st.info("Please enter your ImgBB API key to proceed.")

</details>

- Screenshot: <img width="1365" height="657" alt="4" src="https://github.com/user-attachments/assets/d97d0d35-206b-4ae8-b774-6b7c396261d3" />


### ✅ Prompt 4 – Image-to-Image (Current Docs)
- Result: Failed
- Notes: No working code produced
- Code Details
  <details>
  import streamlit as st
    import requests
    import base64
    import urllib.parse

    st.title("Image Transformer App using Pollinations.AI")

    st.markdown("""
    This app allows you to upload an image, enter a style or modification prompt, and generate a transformed version using the Pollinations.AI Image-to-Image API (kontext     model).

    **Requirements:**
    - Sign up for a free imgbb account at [imgbb.com](https://imgbb.com) to get an API key (required to temporarily host your uploaded image and get a public URL).
    - No signup needed for Pollinations.AI basic usage.

    **How to use:**
    1. Enter your imgbb API key.
    2. Upload an image (JPG, PNG, or JPEG).
    3. Enter a modification prompt (e.g., "turn this into a watercolor painting" or "make this in cyberpunk style").
    4. Click 'Transform' to generate the result.
    """)

    imgbb_api_key = st.text_input("Enter your imgbb API key", type="password")

    uploaded_file = st.file_uploader("Upload an image", type=["jpg", "png", "jpeg"])
    
    prompt = st.text_input("Enter style or modification prompt", value="turn this into a watercolor painting")

    if st.button("Transform"):
    if not imgbb_api_key:
        st.error("Please enter your imgbb API key.")
    elif not uploaded_file:
        st.error("Please upload an image.")
    elif not prompt:
        st.error("Please enter a prompt.")
    else:
        with st.spinner("Uploading image to imgbb..."):
            try:
                # Read the uploaded image
                image_bytes = uploaded_file.read()
                base64_image = base64.b64encode(image_bytes).decode('utf-8')

                # Upload to imgbb
                upload_url = "https://api.imgbb.com/1/upload"
                payload = {
                    "key": imgbb_api_key,
                    "image": base64_image,
                    "expiration": 600  # Expire after 10 minutes (optional, to keep temporary)
                }
                upload_response = requests.post(upload_url, params=payload)
                upload_response.raise_for_status()
                upload_data = upload_response.json()
                input_image_url = upload_data['data']['url']
                st.success(f"Image uploaded successfully. Public URL: {input_image_url}")
            except Exception as e:
                st.error(f"Error uploading to imgbb: {str(e)}")
                st.stop()

        with st.spinner("Transforming image with Pollinations.AI..."):
            try:
                # Prepare Pollinations API request
                encoded_prompt = urllib.parse.quote(prompt)
                poll_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
                params = {
                    "model": "kontext",
                    "image": input_image_url,
                    "width": 1024,  # Default, can be customized
                    "height": 1024,
                    "seed": 42,  # For consistency, optional
                    "nologo": "true"  # Remove watermark if you have an account, otherwise false
                }

                poll_response = requests.get(poll_url, params=params, timeout=300)
                poll_response.raise_for_status()

                # Display the original and transformed images
                col1, col2 = st.columns(2)
                with col1:
                    st.image(image_bytes, caption="Original Image", use_column_width=True)
                with col2:
                    st.image(poll_response.content, caption="Transformed Image", use_column_width=True)
            except Exception as e:
                st.error(f"Error from Pollinations API: {str(e)}")

</details>

- Screenshot: <img width="1364" height="643" alt="4" src="https://github.com/user-attachments/assets/d7773cca-d79d-495a-8edb-01a9cac472ae" />


### ✅ Prompt 5 – Multi-Modal (Technical Docs)
- Result: Failed
- Notes: Audio endpoint unclear / missing auth
- Code Details
  <details>
      import urllib.request
    import urllib.parse
    import os

    def generate_story(prompt):
    """
    Generate a short story using Pollinations' text API.
    """
    story_prompt = f"Write a short story about {prompt} in 200-300 words."
    encoded_prompt = urllib.parse.quote(story_prompt)
    url = f"https://text.pollinations.ai/{encoded_prompt}?model=openai"
    
    try:
        with urllib.request.urlopen(url) as response:
            story = response.read().decode('utf-8')
        return story.strip()
    except Exception as e:
        print(f"Error generating story: {e}")
        return None

    def generate_image_cover(prompt):
    """
    Generate an image cover using Pollinations' image API.
    """
    image_prompt = f"A vibrant cover image for a story about {prompt}"
    encoded_prompt = urllib.parse.quote(image_prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&model=flux&nologo=true"
    
    try:
        file_path = "cover.jpg"
        urllib.request.urlretrieve(url, file_path)
        return file_path
    except Exception as e:
        print(f"Error generating image: {e}")
        return None

    def generate_audio_narration(story):
    """
    Generate audio narration using Pollinations' audio API.
    """
    if not story:
        return None
    encoded_text = urllib.parse.quote(story)
    url = f"https://text.pollinations.ai/{encoded_text}?model=openai-audio&voice=nova"
    
    try:
        file_path = "narration.mp3"
        urllib.request.urlretrieve(url, file_path)
        return file_path
    except Exception as e:
        print(f"Error generating audio: {e}")
        return None

    def main():
    """
    Main function to run the multi-modal story generator app.
    """
    print("Welcome to the Multi-Modal Story Generator!")
    print("This app uses Pollinations.AI APIs to generate a story, an image cover, and audio narration.")
    
    prompt = input("Enter a prompt for your story (e.g., 'a brave knight and a dragon'): ").strip()
    if not prompt:
        print("No prompt provided. Exiting.")
        return
    
    print("\nGenerating story...")
    story = generate_story(prompt)
    if story:
        print("\nGenerated Story:\n")
        print(story)
    else:
        print("Failed to generate story. Exiting.")
        return
    
    print("\nGenerating image cover...")
    image_path = generate_image_cover(prompt)
    if image_path:
        print(f"Image cover saved as: {os.path.abspath(image_path)}")
    
    print("\nGenerating audio narration...")
    audio_path = generate_audio_narration(story)
    if audio_path:
        print(f"Audio narration saved as: {os.path.abspath(audio_path)}")
    
    print("\nAll done! You can now view the image and play the audio file.")

    if __name__ == "__main__":
    main()

</details>
- Screenshot: <img width="441" height="314" alt="image" src="https://github.com/user-attachments/assets/4f699eed-7c57-4dbc-a9aa-d8c70fb2ddcb" />


### ✅ Prompt 5 – Multi-Modal (Current Docs)
- Result: Partial
- Notes: Generated text + image but missing audio
- Code Details
  <details>
  import requests
    from urllib.parse import quote
    import argparse

    def generate_story(topic, model="openai", temperature=1.0):
    """
    Generate a short story using the Text Generation API.
    """
    prompt = f"Write a short, engaging story about {topic}. Keep it under 500 words."
    encoded_prompt = quote(prompt)
    url = f"https://text.pollinations.ai/{encoded_prompt}"
    params = {
        "model": model,
        "temperature": temperature,
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.text.strip()
    else:
        raise Exception(f"Error generating story: {response.status_code} - {response.text}")

    def generate_image_cover(story, model="flux", width=1024, height=1024):
    """
    Generate a cover image based on a summary of the story using the Image Generation API.
    """
    # Create a simple prompt from the story (first 100 chars as summary)
    summary = story[:100].strip() + "..." if len(story) > 100 else story
    prompt = f"Create a vibrant cover image for this story: {summary}"
    encoded_prompt = quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
    params = {
        "model": model,
        "width": width,
        "height": height,
    }
    response = requests.get(url, params=params, timeout=60)
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"Error generating image: {response.status_code} - {response.text}")

    def generate_audio_narration(story, voice="nova"):
    """
    Generate audio narration of the story using the Audio Generation API.
    """
    encoded_story = quote(story)
    url = f"https://text.pollinations.ai/{encoded_story}"
    params = {
        "model": "openai-audio",
        "voice": voice,
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"Error generating audio: {response.status_code} - {response.text}")

    def main():
    parser = argparse.ArgumentParser(description="Multi-Modal Story Generator using Pollinations.AI APIs")
    parser.add_argument("topic", type=str, help="The topic for the story (e.g., 'a magical forest adventure')")
    args = parser.parse_args()

    topic = args.topic
    print(f"Generating story for topic: {topic}...")

    try:
        # Step 1: Generate the story
        story = generate_story(topic)
        print("\nGenerated Story:\n")
        print(story)
        with open("story.txt", "w") as f:
            f.write(story)
        print("\nStory saved to 'story.txt'.")

        # Step 2: Generate the image cover
        image_data = generate_image_cover(story)
        with open("cover.jpg", "wb") as f:
            f.write(image_data)
        print("Cover image saved to 'cover.jpg'.")

        # Step 3: Generate the audio narration
        audio_data = generate_audio_narration(story)
        with open("narration.mp3", "wb") as f:
            f.write(audio_data)
        print("Audio narration saved to 'narration.mp3'.")

        print("\nAll multi-modal outputs generated successfully!")
    except Exception as e:
        print(f"Error: {str(e)}")

    if __name__ == "__main__":
    main()

</details>

- Screenshot: <img width="935" height="96" alt="5" src="https://github.com/user-attachments/assets/b663673d-b17b-4098-a468-422710a5e875" />


---

---

## 🚀 Future Work Suggestions
- Automate evaluation via CI with AI agent test runner
- Add runnable examples folder for each API use case
- Create `ai-friendly-apidocs.md` optimized for LLMs
- Provide starter templates (React, Python, Node.js)

---
Both Docs Used are inclued in the hacktoberfest-2025/apidocs-evaluation folder
