import styled from '@emotion/styled';
import { useEffect, useState, useRef } from 'react';
import { isMature } from '../../data/mature';
import Button from '@material-ui/core/Button';
import { Input, Tooltip, Typography } from '@material-ui/core';

export function GenerativeImageFeed() {
  const [image, setImage] = useState(null);
  const [nextPrompt, setNextPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [serverLoad, setServerLoad] = useState(0);
  // const [imageQueue, setImageQueue] = useState([]);
  const loadedImages = useRef([]);
  const queuedImages = useRef([]);
  // console.log("Image queue:", imageQueue);

  // estimate number generated so far 1296000 + 1 image per 10 seconds since 2023-06-09
  // define 2023-06-09
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

    // on error close and reopen
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

  // image clickable on the webpage.
  return (
  <div>
    <br /><br /><br /><br /><br />
    <GenerativeImageURLContainer>
      <ImageURLHeading>Image Feed</ImageURLHeading>
      {image && (
        <div style={{ wordBreak: "break-all" }}>
          <a href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
            <ImageStyle
              src={image["imageURL"]}
              alt="generative_image"
              onLoad={() => {
                setPrompt(shorten(nextPrompt));
                console.log("Loaded image. Setting prompt to: ", nextPrompt);
              }}
            />
          </a>
          <br />
          Prompt: <b>{prompt}</b>
        </div>
      )}
      <ServerLoadDisplay concurrentRequests={serverLoad} />
      Generated #: <Typography variant="h6" component="h4">{formatImagesGenerated(imagesGenerated)}</Typography><br />
      <br />
      Create: <b style={{ whiteSpace: "nowrap" }}><a href={image?.imageURL}>https://pollinations.ai/p/[prompt]</a><ParamsButton /> </b> <br />
      {/* links */}
      Create with ChatGPT: <b><a href="https://chat.openai.com/share/5b94d100-52f8-4142-ab94-8fa2e36d0a63">ChatGPT</a>, <a href="https://www.reddit.com/r/ChatGPT/comments/zktygd/did_you_know_you_can_get_chatgpt_to_generate/">Reddit</a>, <a href="https://youtu.be/gRP3V2sz-M8?t=55">Youtube</a></b>
      {/* input field */}
      <br />
      <br />
      <PromptInput />
    </GenerativeImageURLContainer>
  </div>
);}


const PromptInput = () => {
  const [prompt, setPrompt] = useState("");

  return <div>
    <Input type="text" value={prompt} onChange={evt => setPrompt(evt.target.value)} style={{ width: "100%" }} placeholder='Or type your prompt here' />
    {/* right aligned button */}
    <div style={{ textAlign: "right" }}>
      <Button onClick={() => window.open(`https://pollinations.ai/prompt/${prompt}`)}>Create</Button>
    </div>
  </div>;
};

const shorten = (str) => str.length > 200 ? str.slice(0, 200) + "..." : str;
function ParamsButton() {
  const [showParams, setShowParams] = useState(false);
  return <Tooltip title="?width=[width]&height=[height]&seed=[seed]"><Button size="small" style={{ minWidth: "16px", display: "inline-block", fontSize: "90%" }} onClick={() => setShowParams(!showParams)}><span style={{ textTransform: "none" }}> {showParams ? "?width=[width]&height=[height]&seed=[seed]" : "+"}</span></Button></Tooltip>;
  // <Button size="small"  style={{ minWidth: "16px", display: "inline-block", fontSize:"90%"}} onClick={() => setShowParams(!showParams)}><span style={{textTransform:"none"}}> { showParams ? "?width=[width]&height=[height]&seed=[seed]" : "+"}</span></Button>;
}

function estimateGeneratedImages() {
  const launchDate = 1701718083442;
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  const imagesGeneratedSinceLaunch = Math.round(differenceInSeconds * 3);

  const imagesGeneratedCalculated = 9000000 + imagesGeneratedSinceLaunch;
  return imagesGeneratedCalculated;
}
// create a small ascii visualization of server load
// very high is 5 concurrent requests
// use some UTF-8 characters to make it look nicer
function ServerLoadDisplay({ concurrentRequests }) {
  concurrentRequests = Math.round(concurrentRequests/2);
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 1);

  return <div>Server Load: {loadDisplay}</div>;
}
const ImageStyle = styled.img`
  max-width: 100%;
  max-height: 400px;
`;

// responsive version that makes the container occupy the full width of the screen if on mobile
const GenerativeImageURLContainer = styled.div`
  background-color: rgba(0,0,0,0.7);
  color: white;

  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 1em;
  width:80%;
  max-width: 550px;
  @media (max-width: 600px) {
    width: 100%;
    left: 0;
    transform: translate(0, -50%);
  }
`;

const ImageURLHeading = styled.h3`
margin-top: 0px; 
margin-bottom: 0px;
`;

const PlayerWrapper = styled.div`
width: 100%;
min-height: 100%;
min-height: 90vh;
top: 0;
bottom: 0;
left: 0;
right:0;
// position: absolute;
z-index: -1;

`;
