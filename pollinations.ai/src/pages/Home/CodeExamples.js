import { useState } from "react"
import { AppBar, ButtonGroup, Button, Box, IconButton } from "@material-ui/core"
import { CodeBlock, irBlack } from "react-code-blocks"
import { ImageURLHeading, URLExplanation } from "./ImageHeading"
import { Colors, Fonts } from "../../styles/global"
import { usePollinationsText } from "@pollinations/react"
import useRandomSeed from "../../hooks/useRandomSeed"
import React from "react";
import { LinkStyle } from "./components"
import FileCopyIcon from '@material-ui/icons/FileCopy'
import { EmojiRephrase } from "../../components/EmojiRephrase"
import { max } from "ramda"

// Common styles
const buttonStyle = (isActive) => ({
  backgroundColor: isActive ? Colors.lime : "transparent",
  color: isActive ? Colors.offblack : Colors.lime,
  fontSize: '1.3rem',
  fontFamily: 'Uncut-Sans-Variable',
  fontStyle: 'normal',
  fontWeight: 600,
  height: "60px",
  position: "relative",
  margin: "0.5em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  letterSpacing: "0.1em",
  borderRadius: "5px",
  padding: "0 1em",
  whiteSpace: "nowrap",
  border: `1px solid ${Colors.lime}`,
});

// Code examples as an object with language property
const CODE_EXAMPLES = {
  api_cheatsheet: {
    code: () => `## THOT-Labs Cheatsheet for Coding Assistants

### Image Generation
Generate Image: \`GET https://image.thot.ai/prompt/{prompt}\`

### Image Models
List Models: \`GET https://image.thot.ai/models\`

### Text Generation
Generate (GET): \`GET https://text.thot.ai/{prompt}\`

### Text Generation (Advanced)
Generate (POST): \`POST https://text.thot.ai/\`

### OpenAI Compatible Endpoint
OpenAI Compatible: \`POST https://text.thot.ai/openai\`

### Text Models
List Models: \`GET https://text.thot.ai/models\`

### Real-time Feeds
Image Feed: \`GET https://image.thot.ai/feed\`
Text Feed: \`GET https://text.thot.ai/feed\`
*\\* required parameter*`,
    language: "markdown"
  },
  llm_prompt: {
    code: () => `You will now act as a prompt generator. 
I will describe an image to you, and you will create a prompt that could be used for image-generation. 
Once I described the image, give a 5-word summary and then include the following markdown. 
  
![Image](https://image.thot.ai/prompt/{description}?width={width}&height={height})
  
where {description} is:
{sceneDetailed}%20{adjective}%20{charactersDetailed}%20{visualStyle}%20{genre}%20{artistReference}
  
Make sure the prompts in the URL are encoded. Don't quote the generated markdown or put any code box around it.`,
    language: "markdown"
  },
  llm_prompt_chat: {
    code: () => `
  # Image Generator Instructions

  You are an image generator. The user provides a prompt. Please infer the following parameters for image generation:

  - **Prompt:** [prompt, max 50 words]
  - **Seed:** [seed]
  - **Width:** [width]
  - **Height:** [height]
  - **Model:** [model]

  ## Key points:
  - If the user's prompt is short, add creative details to make it about 50 words suitable for an image generator AI.
  - Each seed value creates a unique image for a given prompt.
  - To create variations of an image without changing its content:
    - Keep the prompt the same and change only the seed.
  - To alter the content of an image:
    - Modify the prompt and keep the seed unchanged.
  - Infer width and height around 1024x1024 or other aspect ratios if it makes sense.
  - Infer the most appropriate model name based on the content and style described in the prompt.

  ## Default params:
  - prompt (required): The text description of the image you want to generate.
  - model (optional): The model to use for generation. Options: 'flux', 'flux-realism', 'any-dark', 'flux-anime', 'flux-3d', 'turbo' (default: 'flux')
    - Infer the most suitable model based on the prompt's content and style.
  - seed (optional): Seed for reproducible results (default: random).
  - width/height (optional): Default 1024x1024.
  - nologo (optional): Set to true to disable the logo rendering.

  ## Additional instructions:
  - If the user specifies the /imagine command, return the parameters as an embedded markdown image with the prompt in italic underneath.

  ## Example:
  ![{description}](https://image.thot.ai/prompt/{description}?width={width}&height={height})
  *{description}*
  `,
    language: "markdown"
  },
  markdown: {
    code: ({ imageURL, prompt, width, height, seed, model }) =>
      `# Image Parameters
Prompt: **${prompt}**
Width: **${width}**
Height: **${height}**
Seed: **${seed}** (Each seed generates a new image)
Model: **${model || "flux"}**

# Image
![Generative Image](${imageURL})`,
    language: "markdown"
  },
  react: {
    code: ({ prompt, width, height, seed, model }) => `
// React code example using useThotImage hook

import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const GeneratedImageComponent = () => {
  const imageUrl = usePollinationsImage('${prompt}', {
    width: ${width},
    height: ${height},
    seed: ${seed},
    model: '${model || "flux"}'
  });

  return (
    <div>
      {imageUrl ? <img src={imageUrl} alt="Generated Image" /> : <p>Loading...</p>}
    </div>
  );
};

export default GeneratedImageComponent;
`,
    language: "javascript"
  },
  html: {
    code: ({ imageURL, prompt, width, height, seed, model }) =>
      `<html>
  <body>
    <h2>Image Parameters</h2>
    <p>Prompt: ${prompt}</p>
    <p>Width: ${width}</p>
    <p>Height: ${height}</p>
    <p>Seed: ${seed} <i>Each seed generates a new image variation</i></p>
    <p>Model: ${model || "flux"}</p>

    <img 
      src="${imageURL}" 
      alt="${shorten(prompt)}"
    />
  </body>
</html>
`,
    language: "html"
  },
  rust: {
    code: ({ prompt, width, height, seed, model }) => `
// Rust code example for downloading an image

use reqwest::blocking::get;
use std::fs::File;
use std::io::Write;

fn download_image(image_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Fetching the image from the URL
    let response = get(image_url)?;
    let mut file = File::create("image.jpg")?;
    let content = response.bytes()?;
    file.write_all(&content)?;

    // Logging completion message
    println!("Download Completed");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Image details
    let prompt = "${shorten(prompt)}";
    let width = ${width};
    let height = ${height};
    let seed = ${seed}; // Each seed generates a new image variation
    let model = "${model || "flux"}"; // Using 'flux' as default if model is not provided

    let image_url = format!(
      "https://thot.ai/p/{}?width={}&height={}&seed={}&model={}",
      prompt, width, height, seed, model
    );

    download_image(&image_url)?;

    Ok(())
}

// Make sure you have the reqwest crate in your Cargo.toml:

[dependencies]
reqwest = { version = "0.11", features =["blocking", "json"] }
  `,
    language: "rust"
  },
  nodejs: {
    code: ({ prompt, width, height, seed, model }) => `
// Node.js code example for downloading an image

import fs from 'fs';
import fetch from 'node-fetch';

async function downloadImage(imageUrl) {
  // Fetching the image from the URL
  const response = await fetch(imageUrl);
  // Reading the response as a buffer
  const buffer = await response.buffer();
  // Writing the buffer to a file named 'image.png'
  fs.writeFileSync('image.png', buffer);
  // Logging completion message
  console.log('Download Completed');
}

// Image details
const prompt = '${shorten(prompt)}';
const width = ${width};
const height = ${height};
const seed = ${seed}; // Each seed generates a new image variation
const model = '${model || "flux"}'; // Using 'flux' as default if model is not provided

const imageUrl = \`https://thot.ai/p/\${encodeURIComponent(prompt)}?width=\${width}&height=\${height}&seed=\${seed}&model=\${model}\`;

downloadImage(imageUrl);
`,
    language: "javascript"
  },
  python: {
    code: ({ prompt, width, height, seed, model }) => `
# Python code example for downloading an image

import requests

def download_image(image_url):
    # Fetching the image from the URL
    response = requests.get(image_url)
    # Writing the content to a file named 'image.jpg'
    with open('image.jpg', 'wb') as file:
        file.write(response.content)
    # Logging completion message
    print('Download Completed')

# Image details
prompt = '${shorten(prompt)}'
width = ${width}
height = ${height}
seed = ${seed} # Each seed generates a new image variation
model = '${model || "flux"}' # Using 'flux' as default if model is not provided

image_url = f"https://thot.ai/p/{prompt}?width={width}&height={height}&seed={seed}&model={model}"

download_image(image_url)


# Using the thot pypi package

## pip install thot

import thot as ai

model_obj = ai.Model()

image = model_obj.generate(
    prompt=f'${shorten(prompt)} {ai.realistic}',
    model=ai.${model || "flux"},
    width=${width},
    height=${height},
    seed=${seed}
)
image.save('image-output.jpg')

print(image.url)
`,
    language: "python"
  },
  feed_endpoints: {
    code: () => `
## Feed Endpoints

### Image Feed

\`GET https://image.thot.ai/feed\`

- **Description:** Provides a real-time stream of images generated by users.
- **Usage:** Connect using an SSE-compatible client to receive continuous image data.
- **Example:**

\`\`\`javascript
const eventSource = new EventSource('https://image.thot.ai/feed');

eventSource.onmessage = function(event) {
  const imageData = JSON.parse(event.data);
  console.log('New image generated:', imageData);
};
\`\`\`

### Text Feed

\`GET https://text.thot.ai/feed\`

- **Description:** Provides a real-time stream of text generated by users.
- **Usage:** Connect using an SSE-compatible client to receive continuous text data.
- **Example:**

\`\`\`javascript
const eventSource = new EventSource('https://text.thot.ai/feed');

eventSource.onmessage = function(event) {
  const textData = JSON.parse(event.data);
  console.log('New text generated:', textData);
};
\`\`\`
`,
    language: "markdown"
  }
};

export function CodeExamples({ image }) {
  const [tabValue, setTabValue] = useState(0); // Set initial tab to 0 (api_cheatsheet)

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const codeExampleTabs = Object.keys(CODE_EXAMPLES);

  const seed = useRandomSeed();
  const markdownText = usePollinationsText(
    "Rephrase with emojis and simplify: 'Learn more on GitHub'",
    { seed }
  );

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("Code copied to clipboard!");
  };

  return (
    <URLExplanation style={{ margin: "0 auto", maxWidth: "1000px" }}>
      <AppBar
        position="static"
        style={{ color: "white", width: "auto", boxShadow: "none" }}
      >
        <ButtonGroup
          variant="contained"
          aria-label="contained primary button group"
          style={{ backgroundColor: "transparent", flexWrap: "wrap", justifyContent: "center", boxShadow: "none" }}
        >
          {codeExampleTabs.map((key, index) => (
            <Button
              key={key}
              onClick={() => handleChange(null, index)}
              style={buttonStyle(tabValue === index)}
            >
              {key}
            </Button>
          ))}
        </ButtonGroup>
      </AppBar>
      <>
        {codeExampleTabs.map((key, index) => {
          if (tabValue !== index || !image || !image.imageURL) return null;

          const { code, language } = CODE_EXAMPLES[key];
          const text = code(image);

          return (
            <Box key={key} position="relative">
              <CodeBlock
                text={text}
                language={language}

                showLineNumbers={text.split("\n").length > 1}
                customStyle={{
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  color: Colors.offwhite,
                  height: "500px",
                  border: `0px`,
                  marginTop: "1em",
                  marginLeft: "10px",
                  marginRight: "10px",
                  padding: "20px",
                  boxShadow: "none",
                  borderRadius: "20px",
                  overflowY: "scroll",
                  scrollbarWidth: "thin", // For Firefox
                  scrollbarColor: `${Colors.gray1} transparent`, // For Firefox
                }}
              />
              <IconButton
                onClick={() => handleCopy(text)}
                style={{
                  position: "absolute",
                  top: 5,
                  right: 15,
                  color: Colors.lime,
                  marginRight: "10px",
                }}
              >
                <FileCopyIcon />
              </IconButton>
            </Box>
          );
        })}
      </>
      {/* <Box mt={2} textAlign="center">
        <ImageURLHeading
          customPrompt={`Github logo that looks cool, on a black background`}
          width="100"
          height="100"
        />
        <span style={{ color: Colors.offwhite, fontFamily: Fonts.body, fontStyle: "normal", fontWeight: "500", fontSize: "1.4em", maxWidth: "400px" }}>
          <EmojiRephrase>
            Check the API documentation
          </EmojiRephrase>
        </span><br />
        <LinkStyle
          href="https://github.com/pollinations/pollinations/blob/master/APIDOCS.md"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: Colors.lime, fontSize: "1.4em" }}
        >
          GitHub
        </LinkStyle>
      </Box> */}
    </URLExplanation>
  );
}

const shorten = (str) => (str.length > 60 ? str.slice(0, 60) + "..." : str)
