import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import WhoWeAre from "./WhoWeAre";
import Discord from "./Discord";
import { GenerativeImageFeed } from "./ImageFeed/GenerativeImageFeed";
import ProjectsSection from "./ProjectsSection";
import CompaniesSection from "./CompaniesSection";
import { ImageContext } from "../../contexts/ImageContext";
import TopBand from "../../components/TopBand"; // Updated import
import { TextFeed } from "./TextFeed"; // Import TextFeed
import { ImageURLHeading } from "./ImageHeading"; // Import ImageURLHeading

export default function Home() {
  const [image, setImage] = useState({});

  return (
    <ImageContext.Provider value={{ image, setImage }}>
      <Style>
        <WhoWeAre />
        <TopBand />
        {/* <ImageURLHeading>Text Feed</ImageURLHeading>
        <TextFeed /> 
        <TopBand /> */}
        <GenerativeImageFeed />
        <TopBand />
        <ProjectsSection />
        <TopBand />
        <Discord />
        <TopBand />
        <CompaniesSection />
        <TopBand />
      </Style>
    </ImageContext.Provider>
  );
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
`;
