import styled from "@emotion/styled"
import { BaseContainer } from "../../styles/global"

import Hero from "./Hero"
import About from "./About"
import WhyWeDoIt from "./WhyWeDoIt"
import MultiplePlatforms from "./MultiplePlatforms"
import EndlessPossibilites from "./EndlessPossibilites"
import TryOut from "./TryOut"

export default function Home() {
  return <HomeStyle>
    <Hero />
    <TryOut />
    <About />
    <MultiplePlatforms />
    {/* <EndlessPossibilites /> */}
    <WhyWeDoIt />
  </HomeStyle>
}

const HomeStyle = styled(BaseContainer)`
padding: 0em;
display: flex;
flex-direction: column;
align-items: center;
`;

