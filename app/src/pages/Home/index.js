import styled from "@emotion/styled"
import Hero from "./Hero"
import WhoWeAre, { ActivityUpdate, DarkLayout } from "./Layouts"
import Discord from "./Discord"
import Dreamachine from "./Dreamachine"
import MusicVideo from "./MusicVideo"
import TwitchSection from "./DreamSection"
import { GenerativeImageFeed } from "./GenerativeImageFeed"
import { KarmaYT } from "./KarmaYT"
import { ChatPrompt } from "./ChatPrompt"
import PageTemplate from "../../components/MarkdownTemplate"
import { ImageURLHeading } from "./styles"
import { MOBILE_BREAKPOINT } from "../../styles/global"
import { useEffect, useRef, useState } from "react"

const topBandPrompt = encodeURIComponent("One horizontal centered row on white background with 4-7 evenly spaced larger circular icons such as animal heads, stars, smileys (be creative with arrows) in black and white.")

const getTopBandPresetsDesign = () => {
  const seed = Math.floor(Math.random() * 20)
  return `https://image.pollinations.ai/prompt/${topBandPrompt}?width=500&height=100&seed=${seed}`
}

export default function Solutions() {
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  }, []);

  return (
    <Style>
      <input ref={hiddenInputRef} type="text" style={{ position: 'absolute', opacity: 0, height: 0, width: 0, border: 'none' }} aria-hidden="true" tabIndex="-1" />
      <WhoWeAre />
      <TopBand />
      {/* <Hero /> */}
      <GenerativeImageFeed />
      <TopBand />
      {/* <ChatPrompt /> */}
      <MusicVideo />
      {/* <TopBand src={getTopBandPresetsDesign()} alt="Top Band" />
      <Dreamachine /> */}
      {/* <TopBand src={getTopBandPresetsDesign()} alt="Top Band" /> */}
      {/* <KarmaYT /> */}
      <TopBand />
      <ImageURLHeading>Events</ImageURLHeading>
      {/* <PageTemplate label="event" /> */}
      {/* <TwitchSection /> */}
      {/* <ActivityUpdate /> */}
      <TopBand />

      <Discord />
      <TopBand />
    </Style>
  )
}

const Style = styled.div`
  width: 100%;
  padding: 0em;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
  }
`

const TopBand = () => {
  const [backgroundImage, setBackgroundImage] = useState('');

  useEffect(() => {
    setBackgroundImage(getTopBandPresetsDesign());
  }, []);

  return (
    <TopBandStyle backgroundImage={backgroundImage} />
  );
}

const TopBandStyle = styled.div`
  width: 100%;
  height: 83px;
  background-image: url('${props => props.backgroundImage}');
  background-repeat: repeat-x;
  background-size: auto 100%;
`
