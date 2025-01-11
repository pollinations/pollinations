import { useState } from "react"
import styled from "@emotion/styled"
import Hero from "./Hero"
import { ImageFeed } from "./ImageFeed"
import Projects from "./Projects"
import { Integration } from "./Integration"
import { ImageContext } from "../utils/ImageContext"
// import Discord from "./Discord"
// import Supporter from "./Supporter"
// import { TextFeed } from "./TextFeed"


export default function Home() {
  const [image, setImage] = useState(null)

  return (
    <ImageContext.Provider value={{ image, setImage }}>
      <Style>
        <Hero />
        {/* <TextFeed />  */}
        <ImageFeed />
        <Integration image={image} />
        <Projects />
        {/* <Discord /> */}
        {/* <Supporter /> */}
      </Style>
    </ImageContext.Provider>
  )
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
`
