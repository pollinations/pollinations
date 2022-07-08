import styled from "@emotion/styled"
import { BaseContainer } from "../../styles/global"

import Hero from "./Hero"
import About from "./About"
import WhyWeDoIt from "./WhyWeDoIt"
import MultiplePlatforms from "./MultiplePlatforms"

export default function Home() {
  return <HomeStyle>
      <Hero />
      <About />
      <MultiplePlatforms/>
      <EmptyPlaceHolder/>
      <WhyWeDoIt/>
    </HomeStyle>
}

const HomeStyle = styled(BaseContainer)`
padding: 0em;
display: flex;
flex-direction: column;
align-items: center;
`;

const EmptyPlaceHolder = styled.div`
background-color: black;
width: 100%;
min-height: 100vh;
`