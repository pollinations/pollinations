import { useEffect, useState, useMemo } from "react" // Added useMemo
import styled from "@emotion/styled"
import WhoWeAre from "./WhoWeAre"
import Discord from "./Discord"
import { GenerativeImageFeed } from "./ImageFeed/GenerativeImageFeed"
import ProjectsSection from "./ProjectsSection"
import CompaniesSection from "./CompaniesSection"
import { usePollinationsImage } from "@pollinations/react"
import useRandomSeed from "../../hooks/useRandomSeed"
import { ImageContext } from "../../contexts/ImageContext";

const topBandPrompt = encodeURIComponent(
  "One horizontal centered row on almost white (#FAFAFA) background with 4-7 evenly spaced larger circular icons such as insects, flowers, pollen, bees, butterflies, (be creative with arrows) in black and white."
)

const getTopBandPresetsDesign = () => {
  const seed = Math.floor(Math.random() * 10)
  return `https://image.pollinations.ai/prompt/${topBandPrompt}?width=500&height=100&seed=${seed}&nologo=true`
}
export default function Home() {
  const [image, setImage] = useState({});
 

  return (      <ImageContext.Provider value={{ image, setImage }}>

    <Style>
      <WhoWeAre />
      <TopBand />
      <GenerativeImageFeed />
      <TopBand />
      <ProjectsSection />
      <Discord />
      <TopBand />
      <CompaniesSection />
      <TopBand />
    </Style>
    </ImageContext.Provider>
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
    return getTopBandPresetsDesign()
  }, [])

  return <TopBandStyle backgroundImage={backgroundImage} />
}

const TopBandStyle = styled.div`
  width: 100%;
  height: 83px;
  background-image: url("${(props) => props.backgroundImage}");
  background-repeat: repeat-x;
  background-size: auto 100%;
`
