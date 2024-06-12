import { useState } from 'react';
import { Typography, Tooltip, IconButton, AppBar, Tabs, Tab, Box, Link } from '@material-ui/core';
import { Code, CodeBlock, CopyBlock, a11yLight, arta, dracula, irBlack } from 'react-code-blocks';
import { URLExplanation } from './styles';
import { Colors } from '../../styles/global';

import InfoIcon from '@material-ui/icons/Info';

import { shorten } from './shorten';

// Code examples as an object
const CODE_EXAMPLES = {
  llm_prompt: () => `You will now act as a prompt generator. 
I will describe an image to you, and you will create a prompt that could be used for image-generation. 
Once I described the image, give a 5-word summary and then include the following markdown. 
  
![Image](https://image.pollinations.ai/prompt/{description}?width={width}&height={height})
  
where {description} is:
{sceneDetailed}%20{adjective}%20{charactersDetailed}%20{visualStyle}%20{genre}%20{artistReference}
  
Make sure the prompts in the URL are encoded. Don't quote the generated markdown or put any code box around it.`,
  markdown: ({ imageURL, prompt, width, height, seed, model }) =>
    `# Image Parameters
Prompt: **${prompt}**
Width: **${width}**
Height: **${height}**
Seed: **${seed}** (Each seed generates a new image)

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

    <img 
      src="${imageURL}" 
      alt="${shorten(prompt)}"
    />
  </body>
</html>
`,

rust:(prompt, width, height, seed, model) => `
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
    let prompt = "the easy way to achieve a goal, efficient, simple, straightf...";
    let width = 1024;
    let height = 1024;
    let seed = 42; // Each seed generates a new image variation
    let model = "pollinations"; // Assuming a model name

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

const imageUrl = \`https://pollinations.ai/p/\${encodeURIComponent(prompt)}?width=\${width}&height=\${height}&seed=\${seed}&model=\${model}\`;

downloadImage(imageUrl);`,

  python: ({ prompt, width, height, seed, model }) => `
# This Python snippet downloads the image using requests and saves it to disk, including image details.

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

image_url = f"https://pollinations.ai/p/{prompt}?width={width}&height={height}&seed={seed}&model={model}"

download_image(image_url)


# Using the pollinations pypi package

## pip install pollinations

import pollinations as ai

model: object = ai.Model()

image: object = model.generate(
    prompt=f'${shorten(prompt)} {ai.realistic}',
    model=ai.turbo,
    width=${width},
    height=${height},
    seed=${seed}
)
image.save('image-output.jpg')

print(image.url)
`
};

export function CodeExamples(image) {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const codeExampleTabs = Object.keys(CODE_EXAMPLES);

  const allTabs = ["link", "discord_bot", ...codeExampleTabs];

  return <URLExplanation > 
    <AppBar position="static" style={{color:"white", width: "auto", marginTop: "30px", boxShadow: 'none' }}>
      <Tabs value={tabValue} onChange={handleChange} aria-label="simple tabs example" variant="scrollable" scrollButtons="on" TabIndicatorProps={{style: {background: Colors.lime}}} >
        {allTabs.map((key) => (
          <Tab key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} />
        ))}
      </Tabs>
    </AppBar>
    <>
      {allTabs.map((key, index) => {

        if (tabValue !== index)
          return null;

        if (!image.imageURL && key !== "discord_bot")
          return null;

        if (key === "link") {
          return (<Box margin="30px" overflow="hidden" >
            <Link variant="body2" href={image.imageURL} target="_blank" rel="noopener noreferrer" style={{ fontSize: '1.0rem', wordBreak: 'break-all' }}>{image.imageURL}</Link>
          </Box>);
        } else if (key === "discord_bot") {
          return (<Box margin="30px" overflow="hidden" >
            <Link variant="body2" href="https://discord.com/application-directory/1123551005993357342" target="_blank" rel="noopener noreferrer" style={{ fontSize: '1.0rem', wordBreak: 'break-all' }}>Discord Bot</Link>
          </Box>);
        }

        const text = CODE_EXAMPLES[key](image);

        return (
          tabValue === index && <CodeBlock
            key={key}
            text={text}
            language={key}
            theme={irBlack}
            // wrapLongLines
            showLineNumbers={text.split("\n").length > 1}
            customStyle={{
              overflow: 'scroll',
              height: '507px',
              backgroundColor: 'transparent',
              color: Colors.offwhite,
              scrollbarColor: 'transparent transparent' // scrollbar thumb and track colors

            }}          />
        )
      })}

    </>
  </URLExplanation>;
}

