import { useState } from 'react';
import { Typography, AppBar, Tabs, Tab, Box, Link } from '@material-ui/core';
import { Code, CodeBlock, CopyBlock, a11yLight, arta, dracula, irBlack } from 'react-code-blocks';
import { URLExplanation } from './styles';
import { shorten } from './shorten';

// Code examples as an object
const CODE_EXAMPLES = {
  markdown: ({imageURL, prompt, width, height, seed, model}) => 
`# Image Parameters
Prompt: **${prompt}**
Width: **${width}**
Height: **${height}**
Seed: **${seed}** (Each seed generates a new image)

# Image
![Generative Image](${imageURL})`,
  html: ({imageURL, prompt, width, height, seed, model}) => 
`<html>
  <body>
    <h2>Image Parameters</h2>
    <p>Prompt: ${prompt}</p>
    <p>Width: ${width}</p>
    <p>Height: ${height}</p>
    <p>Seed: ${seed} <i>Each seed generates a new image variation</></p>

    <img 
      src="${imageURL}" 
      alt="${shorten(prompt)}"
    />
  </body>
</html>
`,


  javascript: ({ prompt, width, height, seed, model}) => `
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

  python: ({ prompt, width, height, seed, model}) => `
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
`
};

export function CodeExamples(image) {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const codeExampleTabs = Object.keys(CODE_EXAMPLES);

  const allTabs = ["link", ...codeExampleTabs];

  return <URLExplanation>
    <Typography variant="body2" component="p" style={{ fontSize: '0.9rem', lineHeight: '1.3' }}>
      Integrate hassle-free without any sign-up, tokens, libraries or other complications.
    </Typography>
    <br />

    <AppBar position="static" style={{ background: 'black', color: 'white' }}>
      <Tabs value={tabValue} onChange={handleChange} aria-label="simple tabs example" variant="scrollable" scrollButtons="auto">
        {allTabs.map((key) => (
          <Tab key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} />
        ))}
      </Tabs>
    </AppBar>
    <Box maxWidth='800px'>
    {allTabs.map((key, index) => {
      
      if (tabValue !== index)
        return null;

      if (!image.imageURL)
        return null;

      if (key === "link") {
        return (<Box margin="10px" maxWidth="800px" overflow="hidden" >
            <Link variant="body2" href={image.imageURL} target="_blank" rel="noopener noreferrer" style={{ fontSize: '1.0rem', color:'deepskyblue', wordBreak: 'break-all' }}>{image.imageURL}</Link>
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
        customStyle={{overFlow:'scroll', maxWidth:'800px'}}
        />
      )
      })}
    </Box>
  </URLExplanation>;
}
