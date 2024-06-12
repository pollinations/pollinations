import styled from "@emotion/styled"
import Hero from "./Hero"
import WhoWeAre, { ActivityUpdate, DarkLayout } from "./Layouts"
import Discord from "./Discord"
import Dreamachine from "./Dreamachine"
import MusicVideo from "./MusicVideo"
import TwitchSection from "./DreamSection"
import { GenerativeImageFeed } from "./GenerativeImageFeed"
import { KarmaImageFeed } from "./KarmaImageFeed"
import PageTemplate from "../../components/MarkdownTemplate"
import { ImageURLHeading } from "./styles"
import TopBandPresetsDesign from "../../assets/imgs/presets-linha.png"
import { MOBILE_BREAKPOINT } from "../../styles/global"

export default function Solutions() {
  return (
    <Style>
      <WhoWeAre />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      {/* <Hero /> */}
      <GenerativeImageFeed />
      <KarmaImageFeed />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      <MusicVideo />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      <ImageURLHeading>Events</ImageURLHeading>
      <PageTemplate label="event" />
      {/* <TwitchSection /> */}
      {/* <ActivityUpdate /> */}
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />

      <Discord />
      <TopBand src={TopBandPresetsDesign} alt="Top Band" />
      {/* <Dreamachine /> */}
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
