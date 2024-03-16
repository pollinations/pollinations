import styled from '@emotion/styled';
import { useEffect, useState, useRef } from 'react';
import { isMature } from '../../data/mature';
import { Input, Typography, Link, Box, Container, Grid, Paper, Tabs, Tab, AppBar, Button, Table, TableBody, TableCell, TableContainer, TableRow } from  '@material-ui/core';
import { CodeBlock, dracula } from "react-code-blocks";
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';

export function GenerativeImageFeed() {
  const [image, setImage] = useState(null);
  const [nextPrompt, setNextPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [serverLoad, setServerLoad] = useState(0);

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


  const shortUrl = shorten(image?.["imageURL"] || "");

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        {image && (
          <>
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
            </ImageContainer>
            <Box style={{width: "600px", position:"relative"}}>
            <TableContainer component={Paper}>
              <Table aria-label="image info table" size="small">
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row">Prompt</TableCell>
                    <TableCell align="right">{shorten(prompt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">Link</TableCell>
                    <TableCell align="right">
                      <Link href={`https://pollinations.ai/p/${encodeURIComponent(prompt)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'deepSkyBlue' }}>
                        {shorten(`https://pollinations.ai/p/${encodeURIComponent(prompt)}`)}
                      </Link>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">Dimensions</TableCell>
                    <TableCell align="right">{`${image.width}x${image.height}, Seed: ${image.seed}`}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">Generations</TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" component="span" style={{ fontWeight: 'bold', color: 'deepSkyBlue' }}>
                        # {formatImagesGenerated(imagesGenerated)}
                      </Typography>,
                      &nbsp;&nbsp;
                      <ServerLoadDisplay concurrentRequests={serverLoad} />
                    </TableCell>
                  </TableRow>
                  </TableBody>
              </Table>
            </TableContainer>
            </Box>
          </>
        )}
        <br />
        <CodeExamples {...{ shortUrl, image}} />
        <br />

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

const shorten = (str) => str.length > 60 ? str.slice(0, 60) + "..." : str;

function CodeExamples({ shortUrl, image}) {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return <URLExplanation>
    <Typography variant="body2" component="p" style={{ fontSize: '0.9rem', lineHeight: '1.3' }}>
      To generate an image with a specific prompt and customize its parameters, use the URL format below. This allows you to specify the image's width, height, and whether it should appear in the feed or display the Pollinations logo. No registration is needed, it's free to use, and super easy to integrate.
    </Typography>
    <br />

    <AppBar position="static" style={{ background: 'black', color: 'white' }}>
      <Tabs value={tabValue} onChange={handleChange} aria-label="simple tabs example">
        <Tab label="Markdown" />
        <Tab label="HTML" />
        <Tab label="JavaScript" />
        <Tab label="Python" />
      </Tabs>
    </AppBar>
    {tabValue === 0 && <CodeBlock
      text={`![Generative Image](${shortUrl})\nUse this markdown snippet to embed the image in your markdown content.`}
      language={"markdown"}
      theme={dracula} />}
    {tabValue === 1 && <CodeBlock
      text={`<img src="${shortUrl}" alt="Generative Image">\nUse this HTML tag to embed the image in your web pages.`}
      language={"html"}
      theme={dracula} />}
    {tabValue === 2 && <CodeBlock
      text={`
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

downloadImage('${image?.imageURL}');
// This Node.js snippet downloads the image using node-fetch and saves it to disk.`}
      language={"javascript"}
      theme={dracula} />}
    {tabValue === 3 && <CodeBlock
      text={`import requests\n\nimage_url = "${shortUrl}"\nimg_data = requests.get(image_url).content\nwith open('image_name.jpg', 'wb') as handler:\n    handler.write(img_data)\n\n# This Python script downloads the image using the requests library.`}
      language={"python"}
      theme={dracula} />}
  </URLExplanation>;
}

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
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2);

  return <>Load: {loadDisplay}</>;
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

const ImageURLHeading = styled.p`
  font-family: ${Fonts.headline} !important;
  font-style: normal  !important;
  font-weight: 400 !important;
  font-size: 96px !important;
  line-height: 105px !important;
  text-transform: capitalize !important;

  margin: 0;
  margin-top: 1em;
  color: ${Colors.offblack};

  span {
    font-family: ${Fonts.headline};
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 58px;
    line-height: 55px;
    margin: 0;
    margin-top: 1em;
  }
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


