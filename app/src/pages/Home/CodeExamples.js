import { useState } from 'react';
import { Typography, AppBar, Tabs, Tab } from '@material-ui/core';
import { CodeBlock, dracula } from 'react-code-blocks';
import { URLExplanation } from './GenerativeImageFeed';

// Code examples as an object
const CODE_EXAMPLES = {
  markdown: ({shortUrl, prompt, width, height, seed, model}) => `![Generative Image](${shortUrl})\nPrompt: ${prompt}\nWidth: ${width}\nHeight: ${height}\nSeed: ${seed}\nModel: ${model}\nUse this markdown snippet to embed the image in your markdown content.`,
  html: shortUrl => `<img src="${shortUrl}" alt="Generative Image">\nUse this HTML tag to embed the image in your web pages.`,
  javascript: ({imageURL, prompt, width, height, seed, model}) => `
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
const imageUrl = '${imageURL}';
const imagePrompt = '${prompt}';
const imageWidth = ${width};
const imageHeight = ${height};
const imageSeed = ${seed};
const imageModel = '${model}';

downloadImage(imageUrl);
// This Node.js snippet downloads the image using node-fetch and saves it to disk, including image details.`,
  python: ({ imageURL, prompt, width, height, seed, model}) => `import requests\n\nimage_url = "${imageURL}"\nimg_data = requests.get(image_url).content\nwith open('image_name.jpg', 'wb') as handler:\n    handler.write(img_data)\n\n# Image details\n# Prompt: ${prompt}\n# Width: ${width}\n# Height: ${height}\n# Seed: ${seed}\n# Model: ${model}\n# This Python script downloads the image using the requests library and includes image details.`
};

export function CodeExamples(image) {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const codeExampleKeys = ['markdown', 'html', 'javascript', 'python'];
  const codeExampleLanguages = ['markdown', 'html', 'javascript', 'python'];

  return <URLExplanation>
    <Typography variant="body2" component="p" style={{ fontSize: '0.9rem', lineHeight: '1.3' }}>
      To generate an image with a specific prompt and customize its parameters, use the URL format below. This allows you to specify the image's width, height, and whether it should appear in the feed or display the Pollinations logo. No registration is needed, it's free to use, and super easy to integrate.
    </Typography>
    <br />

    <AppBar position="static" style={{ background: 'black', color: 'white' }}>
      <Tabs value={tabValue} onChange={handleChange} aria-label="simple tabs example">
        {codeExampleKeys.map((key, index) => (
          <Tab key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} />
        ))}
      </Tabs>
    </AppBar>
    {codeExampleKeys.map((key, index) => (
      tabValue === index && <CodeBlock
        key={key}
        text={CODE_EXAMPLES[key](image)}
        language={codeExampleLanguages[index]}
        theme={dracula} />
    ))}
  </URLExplanation>;
}
