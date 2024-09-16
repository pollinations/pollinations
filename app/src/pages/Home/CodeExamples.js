import { useState } from "react"
import { AppBar, Tabs, Tab, Box, Link } from "@material-ui/core"
import { CodeBlock, irBlack } from "react-code-blocks"
import { ImageURLHeading, URLExplanation } from "./ImageHeading"
import { Colors } from "../../styles/global"
import ReactMarkdown from "react-markdown"

// Code examples as an object
const CODE_EXAMPLES = {
  llm_prompt: () => `You will now act as a prompt generator. 
I will describe an image to you, and you will create a prompt that could be used for image-generation. 
Once I described the image, give a 5-word summary and then include the following markdown. 
  
![Image](https://image.pollinations.ai/prompt/{description}?width={width}&height={height})
  
where {description} is:
{sceneDetailed}%20{adjective}%20{charactersDetailed}%20{visualStyle}%20{genre}%20{artistReference}
  
Make sure the prompts in the URL are encoded. Don't quote the generated markdown or put any code box around it.`,
  llm_prompt_advanced: () => `
# Image Generator Instructions

You are an image generator. The user provides a prompt. Please infer the following parameters for image generation:

    {
      "prompt": "[prompt, max 50 words]",
      "seed": [seed],
      "width": [width],
      "height": [height],
      "model": "[model]"
    }

Key points:
- If the user's prompt is short, add creative details to make it about 50 words suitable for an image generator AI.
- Each seed value creates a unique image for a given prompt.
- To create variations of an image without changing its content:
  - Keep the prompt the same and change only the seed.
- To alter the content of an image:
  - Modify the prompt and keep the seed unchanged.
- Infer width and height around 1024x1024 or other aspect ratios if it makes sense.
- Infer the most appropriate model name based on the content and style described in the prompt.

Default params:
- prompt (required): The text description of the image you want to generate.
- model (optional): The model to use for generation. Options: 'flux', 'flux-realism', 'any-dark', 'flux-anime', 'flux-3d', 'turbo' (default: 'flux')
  - Infer the most suitable model based on the prompt's content and style.
- seed (optional): Seed for reproducible results (default: random).
- width/height (optional): Default 1024x1024.
- nologo (optional): Set to true to disable the logo rendering.

Additional instructions:
- If the user specifies the /imagine command, return the parameters as JSON.
- Response should be in valid JSON format only.
`,
  api_description: () => `
# Pollinations AI Image Generation API

## Endpoint
GET https://image.pollinations.ai/prompt/{prompt}

## Description
This endpoint generates an image based on the provided prompt and optional parameters. It returns a raw image file.

## Parameters
- prompt (required): The text description of the image you want to generate. Should be URL-encoded.
- model (optional): The model to use for generation. Options: 'flux' or 'turbo'. Default: 'turbo'
- seed (optional): Seed for reproducible results. Default: random
- width (optional): Width of the generated image. Default: 1024
- height (optional): Height of the generated image. Default: 1024
- nologo (optional): Set to 'true' to turn off the rendering of the logo
- nofeed (optional): Set to 'true' to prevent the image from appearing in the public feed
- enhance (optional): Set to 'true' or 'false' to turn on or off prompt enhancing (passes prompts through an LLM to add detail)

## Example Usage
https://image.pollinations.ai/prompt/A%20beautiful%20sunset%20over%20the%20ocean?model=flux&width=1280&height=720&seed=42&nologo=true&enhance=true

## Response
The API returns a raw image file (typically JPEG or PNG) as the response body. You can directly embed the image in your HTML or Markdown.
`,
  markdown: ({ imageURL, prompt, width, height, seed, model }) =>
    `# Image Parameters
Prompt: **${prompt}**
Width: **${width}**
Height: **${height}**
Seed: **${seed}** (Each seed generates a new image)
Model: **${model || "turbo"}**

# Image
![Generative Image](${imageURL})`,
  html: ({ imageURL, prompt, width, height, seed, model }) =>
    `<html>
  <body>
    <h2>Image Parameters</h2>
    <p>Prompt: ${prompt}</p>
    <p>Width: ${width}</p>
    <p>Height: ${height}</p>
    <p>Seed: ${seed} <i>Each seed generates a new image variation</i></p>
    <p>Model: ${model || "turbo"}</p>

    <img 
      src="${imageURL}" 
      alt="${shorten(prompt)}"
    />
  </body>
</html>
`,

  rust: ({ prompt, width, height, seed, model }) => `
// Here's the equivalent Rust code using the reqwest crate for HTTP requests
// and the std::fs module for file operations.
// First part of the code that fetches an image from a URL and saves it to a file.

use reqwest::blocking::get;
use std::fs::File;
use std::io::copy;
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
    let model = "${model || "turbo"}"; // Using 'turbo' as default if model is not provided

    let image_url = format!(
        "https://pollinations.ai/p/{}?width={}&height={}&seed={}&model={}",
        prompt, width, height, seed, model
    );

    download_image(&image_url)?;

    Ok(())
}

// Make sure you have the reqwest crate in your Cargo.toml:

[dependencies]
reqwest = { version = "0.11", features = ["blocking", "json"] }
`,

  nodejs: ({ prompt, width, height, seed, model }) => `
// This Node.js snippet downloads the image using node-fetch and saves it to disk, including image details.

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
const model = '${model || "turbo"}'; // Using 'turbo' as default if model is not provided

const imageUrl = \`https://pollinations.ai/p/\${encodeURIComponent(prompt)}?width=\${width}&height=\${height}&seed=\${seed}&model=\${model}\`;

downloadImage(imageUrl);`,

  python: ({ prompt, width, height, seed, model }) => `
# This Python snippet downloads the image using requests and saves it to disk, including image details.

import requests

def download_image(image_url):
    // Fetching the image from the URL
    response = requests.get(image_url)
    // Writing the content to a file named 'image.jpg'
    with open('image.jpg', 'wb') as file:
        file.write(response.content)
    // Logging completion message
    print('Download Completed')

# Image details
prompt = '${shorten(prompt)}'
width = ${width}
height = ${height}
seed = ${seed} // Each seed generates a new image variation
model = '${model || "turbo"}' // Using 'turbo' as default if model is not provided

image_url = f"https://pollinations.ai/p/{prompt}?width={width}&height={height}&seed={seed}&model={model}"

download_image(image_url)


# Using the pollinations pypi package

## pip install pollinations

import pollinations as ai

model_obj: object = ai.Model()

image: object = model_obj.generate(
    prompt=f'${shorten(prompt)} {ai.realistic}',
    model=ai.${model || "turbo"},
    width=${width},
    height=${height},
    seed=${seed}
)
image.save('image-output.jpg')

print(image.url)
`,
}

export function CodeExamples(image) {
  const [tabValue, setTabValue] = useState(0) // Set initial tab to 0 (llm_prompt)

  const handleChange = (event, newValue) => {
    setTabValue(newValue)
  }

  const codeExampleTabs = Object.keys(CODE_EXAMPLES)

  // Add "llm_prompt" and "llm_prompt_advanced" as the first tabs
  const allTabs = [
    "llm_prompt",
    "api_description",
    "llm_prompt_advanced",

    "link",
    "discord_bot",
    ...codeExampleTabs.filter((tab) => tab !== "llm_prompt" && tab !== "llm_prompt_advanced" && tab !== "api_description"),
  ]

  return (
    <Box style={{ marginTop: "6em" }}>
      <ImageURLHeading whiteText={"#E0F041"} width={350} height={70}>
        Integrate
      </ImageURLHeading>
      <URLExplanation>
        <AppBar position="static" style={{ color: "white", width: "auto", boxShadow: "none" }}>
          <Tabs
            value={tabValue}
            onChange={handleChange}
            aria-label="simple tabs example"
            variant="scrollable"
            scrollButtons="on"
            TabIndicatorProps={{ style: { background: Colors.lime } }}
          >
            {allTabs.map((key, index) => (
              <Tab
                key={key}
                label={
                  key === "llm_prompt" || key === "llm_prompt_advanced"
                    ? key.replace("_", " ").toUpperCase()
                    : key.charAt(0).toUpperCase() + key.slice(1)
                }
                style={{
                  color: tabValue === index ? Colors.lime : Colors.offwhite,
                  backgroundColor: "transparent",
                  boxShadow: "none",
                  fontFamily: "Uncut-Sans-Variable",
                  fontStyle: "normal",
                  borderRadius: 0,
                }}
              />
            ))}
          </Tabs>
        </AppBar>
        <>
          {allTabs.map((key, index) => {
            if (tabValue !== index) return null

            if (!image.imageURL && key !== "discord_bot") return null

            if (key === "link") {
              return (
                <Box margin="30px" overflow="hidden">
                  <Link
                    variant="body2"
                    href={image.imageURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "1.0rem", wordBreak: "break-all" }}
                  >
                    {image.imageURL}
                  </Link>
                </Box>
              )
            } else if (key === "discord_bot") {
              return (
                <Box margin="30px" overflow="hidden">
                  <Link
                    variant="body2"
                    href="https://discord.com/application-directory/1123551005993357342"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "1.0rem", wordBreak: "break-all" }}
                  >
                    Discord Bot
                  </Link>
                </Box>
              )
            }

            const text = CODE_EXAMPLES[key](image)

            if (key === "api_description") {
              return (
                <Box margin="30px" overflow="hidden">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </Box>
              )
            }

            return (
              tabValue === index && (
                <CodeBlock
                  key={key}
                  text={text}
                  language={key}
                  theme={irBlack}
                  // wrapLongLines
                  showLineNumbers={text.split("\n").length > 1}
                  customStyle={{
                    backgroundColor: "transparent",
                    color: Colors.offwhite,
                    scrollbarColor: "transparent transparent", // scrollbar thumb and track colors
                  }}
                />
              )
            )
          })}
        </>
      </URLExplanation>
    </Box>
  )
}

const shorten = (str) => (str.length > 60 ? str.slice(0, 60) + "..." : str)
