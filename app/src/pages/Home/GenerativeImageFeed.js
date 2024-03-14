import styled from '@emotion/styled';
import { useEffect, useState, useRef } from 'react';
import { isMature } from '../../data/mature';
import { Input, Typography, Link, Box, Container, Grid, Paper, Tabs, Tab, AppBar, Button } from  '@material-ui/core';
import { CodeBlock, dracula } from "react-code-blocks";

export function GenerativeImageFeed() {
  const [image, setImage] = useState(null);
  const [nextPrompt, setNextPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [serverLoad, setServerLoad] = useState(0);
  const [tabValue, setTabValue] = useState(0);

  const loadedImages = useRef([]);
  const queuedImages = useRef([]);

  const imagesGeneratedCalculated = estimateGeneratedImages();
  const [imagesGenerated, setImagesGenerated] = useState(imagesGeneratedCalculated);

  useEffect(() => {
    const getEventSource = () => {
      const imageFeedSource = new EventSource("https://image.pollinations.ai/feed");
      imageFeedSource.onmessage = evt => {
        const data = JSON.parse(evt.data);
        setServerLoad(data["concurrentRequests"]);
        if (data["nsfw"]) {
          console.log("Skipping NSFW content:", data["nsfw"], data)
          return;
        }

        if (data["imageURL"]) {
          setImagesGenerated(no => no + 1);
          const matureWord = isMature(data["prompt"]) && false;
          if (matureWord) {
            console.log("Skipping mature word:", matureWord, data["prompt"]);
            return;
          }
          queuedImages.current.push(data);
        }
      };
      return imageFeedSource;
    };

    let eventSource = getEventSource();

    eventSource.onerror = async () => {
      await new Promise(r => setTimeout(r, 1000));
      console.log("Event source error. Closing and re-opening.");
      eventSource.close();
      eventSource = getEventSource();
    };

    return () => {
      eventSource.close();
    };
  }, [setServerLoad]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (loadedImages.current.length > 0) {
        const nextImage = loadedImages.current.shift();
        setImage(nextImage);
        setNextPrompt(nextImage["originalPrompt"]);
      }

      if (loadedImages.current.length < 5) {
        if (queuedImages.current.length > 0) {
          const data = queuedImages.current.shift();
          const img = new Image();
          img.src = data["imageURL"];
          img.onload = () => {
            loadedImages.current.push(data);
          };
        };
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [setImage, setNextPrompt]);

  const formatImagesGenerated = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        {image && (
          <ImageContainer>
            <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
              <ImageStyle
                src={image["imageURL"]}
                alt="generative_image"
                onLoad={() => {
                  setPrompt(shorten(nextPrompt));
                  console.log("Loaded image. Setting prompt to: ", nextPrompt);
                }}
              />
            </Link>
            <PromptDisplay>Prompt: <b>{prompt}</b></PromptDisplay>
          </ImageContainer>
        )}
        <ServerLoadDisplay concurrentRequests={serverLoad} />
        <Typography variant="h6" component="h4">Generated #: {formatImagesGenerated(imagesGenerated)}</Typography>
        <URLExplanation>
          <Typography variant="body2" component="p" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>
            To generate an image with a specific prompt and customize its parameters, use the URL format below. This allows you to specify the image's width, height, and whether it should appear in the feed or display the Pollinations logo. No registration is needed, it's free to use, and super easy to integrate.         
          </Typography>
          <AppBar position="static" style={{ background: 'black', color: 'white' }}>
            <Tabs value={tabValue} onChange={handleChange} aria-label="simple tabs example">
              <Tab label="Markdown" />
              <Tab label="HTML" />
              <Tab label="JavaScript" />
              <Tab label="Python" />
            </Tabs>
          </AppBar>
          {tabValue === 0 && <CodeBlock
            text={`![Generative Image](${image?.imageURL})\nUse this markdown snippet to embed the image in your markdown content.`}
            language={"markdown"}
            theme={dracula}
          />}
          {tabValue === 1 && <CodeBlock
            text={`<img src="${image?.imageURL}" alt="Generative Image">\nUse this HTML tag to embed the image in your web pages.`}
            language={"html"}
            theme={dracula}
          />}
          {tabValue === 2 && <CodeBlock
            text={`async function downloadImage(imageUrl) {\n  const response = await fetch(imageUrl);\n  const blob = await response.blob();\n  const url = window.URL.createObjectURL(blob);\n  const a = document.createElement('a');\n  a.style.display = 'none';\n  a.href = url;\n  a.download = 'image.png';\n  document.body.appendChild(a);\n  a.click();\n  window.URL.revokeObjectURL(url);\n  console.log('Download Completed');\n}\n\ndownloadImage('${image?.imageURL}');\n\n// This JavaScript snippet downloads the image using the fetch API with async/await.`}
            language={"javascript"}
            theme={dracula}
          />}
          {tabValue === 3 && <CodeBlock
            text={`import requests\n\nimage_url = "${image?.imageURL}"\nimg_data = requests.get(image_url).content\nwith open('image_name.jpg', 'wb') as handler:\n    handler.write(img_data)\n\n# This Python script downloads the image using the requests library.`}
            language={"python"}
            theme={dracula}
          />}
        </URLExplanation>
        <Link href={`https://pollinations.ai/p/${encodeURIComponent(nextPrompt)}?width=1080&height=720&nofeed=true&nologo=true`} underline="none">Generate Image</Link>
        <PromptInput />
      </GenerativeImageURLContainer>
    </Box>
  );
}

const PromptInput = () => {
  const [prompt, setPrompt] = useState("");

  return <InputContainer>
    <Input type="text" value={prompt} onChange={evt => setPrompt(evt.target.value)} placeholder='Or type your prompt here' />
    <Button onClick={() => window.open(`https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1080&height=720&nofeed=true&nologo=true`)}>Create</Button>
  </InputContainer>;
};

const shorten = (str) => str.length > 200 ? str.slice(0, 200) + "..." : str;

function estimateGeneratedImages() {
  const launchDate = 1701718083442;
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * 3);

  const imagesGeneratedCalculated = 9000000 + imagesGeneratedSinceLaunch;
  return imagesGeneratedCalculated;
}

function ServerLoadDisplay({ concurrentRequests }) {
  concurrentRequests = Math.round(concurrentRequests/2);
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 1);

  return <Box>Server Load: {loadDisplay}</Box>;
}

const ImageStyle = styled.img`
  max-width: 100%;
  max-height: 400px;
`;

const GenerativeImageURLContainer = styled(Container)`
  background-color: rgba(0,0,0,0.7);
  color: white;
  margin: 2em auto;
  padding: 1em;
  width: 80%;
  border-radius: 8px;
  @media (max-width: 600px) {
    width: 95%;
  }
`;

const ImageURLHeading = styled(Typography)`
  font-size: 1.5em;
  margin: 0;
  padding-bottom: 0.5em;
`;

const ImageContainer = styled(Paper)`
  margin-bottom: 1em;
`;

const PromptDisplay = styled(Box)`
  margin-top: 0.5em;
`;

const URLExplanation = styled(Box)`
  margin-top: 1em;
  font-size: 0.9em;
`;

const InputContainer = styled(Grid)`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: 1em;
`;
