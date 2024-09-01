import styled from "@emotion/styled"
import WhoWeAre from "./Layouts"
import Discord from "./Discord"
import MusicVideo from "./MusicVideo"
import { GenerativeImageFeed } from "./ImageFeed/GenerativeImageFeed.js"
import ProjectsSection from "./ProjectsSection"
import CompaniesSection from "./CompaniesSection" // Import the new CompaniesSection
import { useEffect, useMemo, useRef } from "react"

const topBandPrompt = encodeURIComponent("One horizontal centered row on almost white (#FAFAFA) background with 4-7 evenly spaced larger circular icons such as insects, flowers, pollen, bees, butterflies, (be creative with arrows) in black and white.")

const getTopBandPresetsDesign = () => {
  const seed = Math.floor(Math.random() * 10)
  return `https://image.pollinations.ai/prompt/${topBandPrompt}?width=500&height=100&seed=${seed}&nologo=true`
}

export default function Home() {
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  }, []);

  return (
    <Style>
      <WhoWeAre />
      <TopBand />
      <GenerativeImageFeed />
      <TopBand />
      <ProjectsSection />
      <TopBand />
      <MusicVideo />
      {/* <TopBand src={getTopBandPresetsDesign()} alt="Top Band" /> */}
      {/* <KarmaYT /> */}
      <TopBand />
      {/* <ImageURLHeading>Events</ImageURLHeading> */}
      {/* <PageTemplate label="event" /> */}
      {/* <TopBand /> */}

      <Discord />
      <TopBand />
      <CompaniesSection /> {/* Add the CompaniesSection */}
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
  const backgroundImage = useMemo(() => {
    return getTopBandPresetsDesign();
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
