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
import TopBandPresetsDesign from "../../assets/imgs/presets-linha.png"
import { MOBILE_BREAKPOINT } from "../../styles/global"
import { useEffect, useRef } from "react"

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
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      {/* <Hero /> */}
      <GenerativeImageFeed />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      {/* <ChatPrompt /> */}
      <MusicVideo />
      {/* <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      <Dreamachine /> */}
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      <KarmaYT />
      <ImageURLHeading>Events</ImageURLHeading>
      {/* <PageTemplate label="event" /> */}
      {/* <TwitchSection /> */}
      {/* <ActivityUpdate /> */}
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />

      <Discord />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
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

const TopBand = styled.img`
  position: relative;
  width: 100%;
  min-height: 59px;
  object-fit: cover;
  background: white;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    height: auto;
    object-fit: cover;
  }
`
