import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { isMature } from '../../data/mature';
import Button from '@material-ui/core/Button';
import { Input, Tooltip } from '@material-ui/core';

export function GenerativeImageFeed() {
  const [image, setImage] = useState(null);
  const [nextPrompt, setNextPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [serverLoad, setServerLoad] = useState(0);

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
        if (data["nsfw"])
          return;
        // console.log("got message", data);
        if (data["imageURL"]) {
          setImagesGenerated(no => no + 1);
          const matureWord = isMature(data["prompt"]) && false;
          if (matureWord) {
            console.log("skipping mature word:", matureWord, data["prompt"]);
            return;
          }
          setImage(data);
          setNextPrompt(data["originalPrompt"]);
        }
      };
      return imageFeedSource;
    };


    let eventSource = getEventSource();

    // on error close and reopen
    eventSource.onerror = async () => {
      await new Promise(r => setTimeout(r, 1000));
      console.log("event source error. closing and reopening");
      eventSource.close();
      eventSource = getEventSource();
    };

    return () => {
      eventSource.close();
    };
  }, [setImage, setServerLoad]);

  return (
    <div>
      <br /><br /><br /><br /><br />
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        {image && <div style={{ wordBreak: "break-all" }}>
          <ImageStyle src={image["imageURL"]} alt="generative_image" onLoad={() => {
            setPrompt(shorten(nextPrompt));
            console.log("loaded image. setting prompt to: ", nextPrompt);
          }} />
          <br />
          Prompt: <b>{prompt}</b>
        </div>}
        <ServerLoadDisplay concurrentRequests={serverLoad} />
        Generated #: <b>{imagesGenerated}</b><br />
        <br />
        Create: <b style={{ whiteSpace: "nowrap" }}><a href={image?.imageURL}>https://image.pollinations.ai/prompt/[prompt]</a><ParamsButton /> </b> <br />
        {/* links */}
        Create with ChatGPT: <b><a href="https://chat.openai.com/share/d24ce24f-283a-4f76-bacb-6e0740c234a1">ChatGPT</a>, <a href="https://www.reddit.com/r/ChatGPT/comments/zktygd/did_you_know_you_can_get_chatgpt_to_generate/">Reddit</a>, <a href="https://youtu.be/gRP3V2sz-M8?t=55">Youtube</a></b>
        {/* input field */}
        <br />
        <br />
        <PromptInput />

      </GenerativeImageURLContainer>
    </div>
  );
}
const PromptInput = () => {
  const [prompt, setPrompt] = useState("");

  return <div>
    <Input type="text" value={prompt} onChange={evt => setPrompt(evt.target.value)} style={{ width: "100%" }} placeholder='Or type your prompt here' />
    {/* right aligned button */}
    <div style={{ textAlign: "right" }}>
      <Button onClick={() => window.open(`https://image.pollinations.ai/prompt/${prompt}`)}>Create</Button>
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
  const launchDate = new Date("2023-06-12T00:00:00.000Z");

  const imagesGeneratedCalculated = 1326520 + Math.floor((Date.now() - launchDate) / 2000);
  return imagesGeneratedCalculated;
}
// create a small ascii visualization of server load
// very high is 5 concurrent requests
// use some UTF-8 characters to make it look nicer
function ServerLoadDisplay({ concurrentRequests }) {
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
