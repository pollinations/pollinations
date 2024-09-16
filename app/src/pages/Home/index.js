import styled from "@emotion/styled"
import WhoWeAre from "./WhoWeAre.js"
import Discord from "./Discord"
import { GenerativeImageFeed } from "./ImageFeed/GenerativeImageFeed.js"
import ProjectsSection from "./ProjectsSection"
import CompaniesSection from "./CompaniesSection" // Import the new CompaniesSection
import { useEffect, useMemo, useRef } from "react"

const topBandPrompt = encodeURIComponent("Create a visually stunning image featuring a horizontal, centered band that stretches across the canvas, resembling a river of vibrant colors flowing from right to left. This ‘river of colors’ should be composed of rich, high-spirited hues blending seamlessly into one another—like a spectrum or rainbow in motion. The colors should be vivid and dynamic, evoking feelings of joy and energy. The flow should have a fluid, wave-like motion, adding a sense of movement and life. Use a solid black background to make the colorful band stand out prominently. The overall design should be beautiful and uplifting, creating an eye-catching ‘space band’ that captures the essence of a flowing river of colors.")

const getTopBandPresetsDesign = () => {
  const seed = Math.floor(Math.random() * 10)
  return `https://image.pollinations.ai/prompt/${topBandPrompt}?width=1920&height=100&seed=${seed}&nologo=true`
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
      <TopBand />
      <WhoWeAre />
      <TopBand />
      <GenerativeImageFeed />
      <TopBand />
      <ProjectsSection />
      <TopBand />
      <Discord />
      <TopBand />
      <CompaniesSection />
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
