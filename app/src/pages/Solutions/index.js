import styled from "@emotion/styled"

import Hero from "./Hero"
import PresetsIntro from "./PresetsIntro"
import CTAs from "./CTAs"
import Integrate from './Integrate'
import Increase from './Increase'

import FeaturedApps from "./FeaturedApp"
import PopulateMetaverses from "./Metaverses"
import DiscordSection from '../../components/Discord'
import Bots from "./YesToBots"

export default function Solutions() {
  return <Style>
    <Hero />
    <PresetsIntro />
    <Integrate />
    <BlankSection/>
    <Increase/>
    <Bots/>
    <FeaturedApps />
    <PopulateMetaverses />
    <CTAs content='about'/>
    <DiscordSection />
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

