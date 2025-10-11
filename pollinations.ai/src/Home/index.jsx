import { useState } from "react";
import styled from "@emotion/styled";
import Hero from "./Hero.jsx";
// import { FeedImage } from "./FeedImage"
// import { FeedText } from "./FeedText"
import { Feeds } from "./Feeds.jsx";
import Projects from "./Projects";
import { Integration } from "./Integration";
import { ImageContext } from "../utils/ImageContext";
import Discord from "./Community";
import Supporter from "./Supporter";
import News from "./News";

export default function Home() {
    const [image, setImage] = useState(null);

    return (
        <ImageContext.Provider value={{ image, setImage }}>
            <Style>
                <Hero />
                <News />
                <Feeds />
                <Projects />
                <Integration />
                <Discord />
                <Supporter />
            </Style>
        </ImageContext.Provider>
    );
}

const Style = styled.div`
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
  }
`;
