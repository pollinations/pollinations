import styled from "@emotion/styled"
import { BaseContainer } from "../../styles/global"

import Hero from "./Hero"
import About from "./About"
import WhyWeDoIt from "./WhyWeDoIt"
import MultiplePlatforms from "./MultiplePlatforms"
import TryOut from "./TryOut"

import BG from '../../assets/imgs/new_bg_sections.png'

export default function Home() {
  return <HomeStyle>
    <Hero />
    <TryOut />
    <About />
    <ExtraBg>
      <MultiplePlatforms />
      <WhyWeDoIt />
    </ExtraBg>
  </HomeStyle>
}

const HomeStyle = styled(BaseContainer)`
padding: 0em;
display: flex;
flex-direction: column;
align-items: center;
`;

const ExtraBg = styled.div`
background-image: url(${BG});
width: 100%;
height: 100%;
background-size: cover;
display: flex;
flex-direction: column;
align-items: center;
`

