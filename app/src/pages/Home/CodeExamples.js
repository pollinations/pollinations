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
    code: () => `## Pollinations.AI Cheatsheet for Coding Assistants

### Image Generation API (Default model: 'flux')

Generate Image: \`GET https://image.pollinations.ai/prompt/{prompt}\`
- Params: prompt*, model, seed, width, height, nologo, private, enhance
- Return: Image file

List Models: \`GET https://image.pollinations.ai/models\`

### Text Generation API (Default model: 'openai')

Generate (GET): \`GET https://text.pollinations.ai/{prompt}\`
- Params: prompt*, model, seed, json, system
- Return: Generated text

Generate (POST): \`POST https://text.pollinations.ai/\`
- Body: messages*, model, seed, jsonMode
- Return: Generated text

OpenAI Compatible: \`POST https://text.pollinations.ai/openai\`
- Body: Follows OpenAI ChatGPT API format
- Return: OpenAI-style response

List Models: \`GET https://text.pollinations.ai/models\`

*\\* required parameter*`,
    language: "markdown"
  },
  llm_prompt: {
    code: () => `You will now act as a prompt generator. 
I will describe an image to you, and you will create a prompt that could be used for image-generation. 
Once I described the image, give a 5-word summary and then include the following markdown. 
  
![Image](https://image.pollinations.ai/prompt/{description}?width={width}&height={height})
  
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
  ![{description}](https://image.pollinations.ai/prompt/{description}?width={width}&height={height})
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
// React code example using usePollinationsImage hook
// For more details, visit: https://react-hooks.pollinations.ai/

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
// For more details, visit: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md

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
      "https://pollinations.ai/p/{}?width={}&height={}&seed={}&model={}",
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
// For more details, visit: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md

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

const imageUrl = \`https://pollinations.ai/p/\${encodeURIComponent(prompt)}?width=\${width}&height=\${height}&seed=\${seed}&model=\${model}\`;

downloadImage(imageUrl);
`,
    language: "javascript"
  },
  python: {
    code: ({ prompt, width, height, seed, model }) => `
# Python code example for downloading an image
# For more details, visit: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md

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

image_url = f"https://pollinations.ai/p/{prompt}?width={width}&height={height}&seed={seed}&model={model}"

download_image(image_url)


# Using the pollinations pypi package

## pip install pollinations

import pollinations as ai

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
  }
}

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
    <URLExplanation>
      <AppBar
        position="static"
        style={{ color: "white", width: "auto", boxShadow: "none" }}
      >
        <ButtonGroup
          variant="contained"
          aria-label="contained primary button group"
          style={{ backgroundColor: "transparent", flexWrap: "wrap", justifyContent: "center" }}
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
                theme={irBlack}
                showLineNumbers={text.split("\n").length > 1}
                customStyle={{
                  backgroundColor: "transparent",
                  color: Colors.offwhite,
                  scrollbarColor: "transparent transparent",
                  border: `5px solid ${Colors.offblack}`,
                  marginTop: "1em",
                  marginLeft: "10px",
                  marginRight: "10px",
                }}
              />
              <IconButton
                onClick={() => handleCopy(text)}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
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
      <Box mt={2} textAlign="center">
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
      </Box>
    </URLExplanation>
  );
}

const shorten = (str) => (str.length > 60 ? str.slice(0, 60) + "..." : str)