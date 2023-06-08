import styled from '@emotion/styled';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase } from './components';
import Player from './Player';
import { useEventSource, useEventSourceListener } from "@react-nano/use-event-source";
import { useState } from 'react';
import { isMature } from '../../data/mature';


const Hero = props => <Style>
  {/* <Container>
    <Headline>
      Pollinations
    </Headline>
      
  </Container> */}
  <HeroContainer>
    <Player src='https://streamable.com/w9p5rz' />
    <GenerativeImageFeed />
  </HeroContainer>
  {/* <BackgroundImage 
    src='bgHero.png' 
    zIndex='-2' 
    alt="hero_bg" /> */}

</Style>;
  
export default Hero;


function GenerativeImageFeed() {
  const [image, setImage] = useState(null);
  const [nextPrompt, setNextPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [serverLoad, setServerLoad] = useState(0);
  const [imagesGenerated, setImagesGenerated] = useState(0);
  
  const [eventSource, eventSourceStatus] = useEventSource("https://image.pollinations.ai/feed", true);
  useEventSourceListener(eventSource, ['message'], evt => {
    const data = JSON.parse(evt.data);
    if (data["imageURL"]) {
      setImagesGenerated(no => no + 1);
      const matureWord = isMature(data["prompt"]);
      if (matureWord) {
        console.log("skipping mature word: ", matureWord, data["prompt"]);
        return;
      }
      setImage(data);
      setNextPrompt(data["prompt"])
    }

    setServerLoad(data["concurrentRequests"]);
  }, [setImage, setServerLoad]);

  return (
      <div>
        <br /><br /><br /><br /><br />
        <GenerativeImageURLContainer>
        <h2 style={{marginTop: "0px"}}>Image URL Feed</h2>
          {eventSourceStatus === "open" ? null : <div>connecting...</div>}
          {image && <div style={{wordBreak:"break-all"}}>
                      <ImageStyle src={image["imageURL"]} alt="generative_image" onLoad={() => {
                        setPrompt(nextPrompt);
                        console.log("loaded image. setting prompt to: ", nextPrompt)
                      }} /> 
                      <br/>
                      Prompt: <b>{prompt}</b>
                    </div>
          }
          <ServerLoadDisplay concurrentRequests={serverLoad} />
          Generated #: <b>{imagesGenerated}</b>
          </GenerativeImageURLContainer>
      </div>
  );
}

// create a small ascii visualization of server load
// very high is 5 concurrent requests
// use some UTF-8 characters to make it look nicer
function ServerLoadDisplay({ concurrentRequests }) {
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇█▉".slice(1, load+1);
  return <div>Server Load: {loadDisplay}</div>
}

const ImageStyle = styled.img`
  max-width: 100%;
`;

// // try to vertically and horizontally center content
// const GenerativeImageURLContainer = styled.div`
//   background-color: rgba(0,0,0,0.7);
//   color: white;

//   position: absolute;
//   top: 50%;
//   left: 50%;
//   transform: translate(-50%, -50%);
//   padding: 1em;

// `;

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
`

const HeroContainer = styled.div`
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow: hidden;

  .VideoBackground{
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    object-fit: cover;
  }
`;

const VideoBackground = styled.video`
  
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

`

const Style = styled.div`
width: 100%;
height: 100%;
position: relative;

display: flex;
justify-content: center;
`

const Container = styled(ContainerBase)`
position: relative;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
`;

const Headline = styled.p`
max-width: 60%;
font-family: ${Fonts.headline};
font-style: normal;
font-weight: 400;
font-size: 96px;
line-height: 106px;
text-transform: capitalize;
margin: 0;
color: ${Colors.offwhite};
text-align: center;
text-transform: capitalize;
span {
  font-family: ${Fonts.headline};
  color: ${Colors.lime};
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 56px;
  line-height: 62px;
}`;