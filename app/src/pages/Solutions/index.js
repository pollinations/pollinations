import styled from "@emotion/styled"

import Hero from "./Hero"
import LayoutLight01 from "./WhoWeAre"
import CTA from "./CTA"
import Integrate from './Integrate'
import Increase from './Increase'
// import { DiscordSectionDark } from '../../components/Discord'
import Bots from "./YesToBots"
import LemonadeAvatar from './LemonadeAvatar'
import Discord from './Discord'

export default function Solutions() {
  return <Style>
    <Hero />
    <LayoutLight01 long id='activityupdate'  />
    <BlankSection/>
    <LayoutLight01 id='whoweare'/>
    {/* <CTA content='about' center/> */}
    <Discord />
  </Style>
}

const BlankSection = styled.div`
background-color: black;
width: 100%;
min-height: 100vh;
`

const Style = styled.div`
width: 100%;
padding: 0em;
margin: 0;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
input:focus, textarea:focus, select:focus{
  outline: none;
}
`;

