import styled from "@emotion/styled"

import Hero from "./Hero"
import PresetsIntro from "./PresetsIntro"
import CTA from "./CTA"
import Integrate from './Integrate'
import Increase from './Increase'
import { DiscordSectionDark } from '../../components/Discord'
import Bots from "./YesToBots"
import LemonadeAvatar from './LemonadeAvatar'

export default function Solutions() {
  return <Style>
    <Hero />
    <PresetsIntro />
    <Integrate />
    <BlankSection/>
    <Increase/>
    <Bots/>
    <LemonadeAvatar />
    <CTA />
    <DiscordSectionDark />
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

